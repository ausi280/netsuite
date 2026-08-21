import type { Knex } from 'knex';
import { SyncStateRepository } from '../repositories/syncStateRepository';
import type { EntityConfig, EntitySummary, Paginated, SortConfig } from './types';

export interface PagedQueryParams {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  sortBy?: unknown;
  sortDir?: unknown;
  subsidiary?: unknown;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

function clampPage(page: unknown): number {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(pageSize: unknown): number {
  const n = Number(pageSize);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.floor(n));
}

/** Resolves sortBy/sortDir against the entity's allow-list, falling back to defaultSort for anything not on it. */
function resolveSort(config: EntityConfig, sortBy: unknown, sortDir: unknown): SortConfig {
  const column = typeof sortBy === 'string' && config.sortableColumns.includes(sortBy) ? sortBy : config.defaultSort.column;
  const dir = sortDir === 'asc' || sortDir === 'desc' ? sortDir : config.defaultSort.dir;
  return { column, dir };
}

/** `(',' + REPLACE(col, ' ', '') + ',') LIKE '%,<id>,%'` — matches a single subsidiary id whether the
 * column holds one scalar value or a comma-separated multi-select ("24, 25"). */
function subsidiaryContainsClause(qb: Knex.QueryBuilder, column: string, id: string, mode: 'and' | 'or'): void {
  const method = mode === 'and' ? 'whereRaw' : 'orWhereRaw';
  qb[method](`(',' + REPLACE(CAST(?? AS NVARCHAR(MAX)), ' ', '') + ',') LIKE ?`, [column, `%,${id},%`]);
}

/**
 * Restricts the query to rows whose subsidiary matches one of `allowedIds`. An empty set means
 * "allowed to see zero subsidiaries" and must return no rows at all - not "unrestricted" - since
 * an empty OR-group would otherwise add no real condition.
 */
function applySubsidiaryRestriction(qb: Knex.QueryBuilder, column: string, allowedIds: Set<string>): void {
  if (allowedIds.size === 0) {
    qb.whereRaw('1 = 0');
    return;
  }
  qb.where((builder) => {
    for (const id of allowedIds) {
      subsidiaryContainsClause(builder, column, id, 'or');
    }
  });
}

/**
 * Builds a fresh query (not `.clone()`d) scoped to the entity's table with the search,
 * requested-subsidiary, and permission-restricted-subsidiary filters applied, so it can be
 * independently used for both the page of rows and the total count without the two queries
 * interfering. `subsidiary`/`restrictSubsidiaries` are only ever matched against
 * `config.subsidiaryColumn` - never an arbitrary request-supplied column name.
 *
 * `restrictSubsidiaries`: `null` means unrestricted (admin); a `Set` (possibly empty) is the
 * caller's actual allow-list and is ALWAYS enforced when the entity has a subsidiaryColumn,
 * regardless of what the request's own `subsidiary` param asked for - the caller can narrow
 * further within their allowed set, never broaden past it.
 */
function buildFilteredQuery(
  db: Knex,
  config: EntityConfig,
  search: string,
  subsidiary: string,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const qb = db(config.table);
  if (search && config.searchableColumns.length > 0) {
    qb.where((builder) => {
      for (const column of config.searchableColumns) {
        builder.orWhere(column, 'like', `%${search}%`);
      }
    });
  }
  if (config.subsidiaryColumn) {
    if (restrictSubsidiaries !== null) {
      applySubsidiaryRestriction(qb, config.subsidiaryColumn, restrictSubsidiaries);
    }
    if (subsidiary) {
      subsidiaryContainsClause(qb, config.subsidiaryColumn, subsidiary, 'and');
    }
  }
  return qb;
}

export async function getPagedRows(
  db: Knex,
  config: EntityConfig,
  params: PagedQueryParams,
  restrictSubsidiaries: Set<string> | null = null,
): Promise<Paginated<Record<string, unknown>>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const { column, dir } = resolveSort(config, params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = typeof params.subsidiary === 'string' ? params.subsidiary.trim() : '';

  const [rows, countRow] = await Promise.all([
    buildFilteredQuery(db, config, search, subsidiary, restrictSubsidiaries)
      .select(config.listColumns)
      .orderBy(column, dir)
      .offset((page - 1) * pageSize)
      .limit(pageSize),
    buildFilteredQuery(db, config, search, subsidiary, restrictSubsidiaries).count({ count: '*' }).first(),
  ]);

  const total = Number((countRow as { count: number | string } | undefined)?.count ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return { data: rows, page, pageSize, total, totalPages };
}

/**
 * Looks up a single row by its idColumn, parsing raw_data (stored as a JSON string) into an
 * object. `restrictSubsidiaries` (null = unrestricted) applies the same permission check as
 * getPagedRows, so a direct/bookmarked detail-page URL can't bypass the subsidiary restriction.
 */
export async function getRowById(
  db: Knex,
  config: EntityConfig,
  id: string,
  restrictSubsidiaries: Set<string> | null = null,
): Promise<Record<string, unknown> | undefined> {
  const qb = db(config.table).where(config.idColumn, id);
  if (config.subsidiaryColumn && restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, config.subsidiaryColumn, restrictSubsidiaries);
  }

  const row = await qb.first();
  if (!row) return undefined;

  const { raw_data, ...rest } = row as Record<string, unknown> & { raw_data?: unknown };
  let parsedRawData: unknown = null;
  if (typeof raw_data === 'string') {
    try {
      parsedRawData = JSON.parse(raw_data);
    } catch {
      // raw_data wasn't valid JSON — surface the original string rather than losing it.
      parsedRawData = raw_data;
    }
  } else if (raw_data != null) {
    parsedRawData = raw_data;
  }

  return { ...rest, raw_data: parsedRawData };
}

/**
 * Distinct subsidiary ids present in this entity's table, for populating a filter dropdown.
 * Empty for entities with no subsidiaryColumn. Some subsidiary columns store multiple ids as
 * a comma-separated string (multi-select NetSuite field) - each stored value is split into its
 * individual ids here so e.g. "24, 25" surfaces as two separately selectable options, "24" and
 * "25", matching how buildFilteredQuery's single-id `contains` filter treats them.
 *
 * `restrictSubsidiaries` (null = unrestricted/admin) intersects the real distinct values with
 * the caller's allow-list, so the dropdown never offers an option they aren't allowed to pick.
 */
export async function getSubsidiaryOptions(
  db: Knex,
  config: EntityConfig,
  restrictSubsidiaries: Set<string> | null = null,
): Promise<string[]> {
  if (!config.subsidiaryColumn) return [];
  if (restrictSubsidiaries !== null && restrictSubsidiaries.size === 0) return [];

  const rows = await db(config.table).distinct(config.subsidiaryColumn).whereNotNull(config.subsidiaryColumn);

  const ids = new Set<string>();
  for (const row of rows) {
    const raw = (row as Record<string, unknown>)[config.subsidiaryColumn as string];
    if (raw === null || raw === undefined || raw === '') continue;
    for (const part of String(raw).split(',')) {
      const trimmed = part.trim();
      if (trimmed && (restrictSubsidiaries === null || restrictSubsidiaries.has(trimmed))) {
        ids.add(trimmed);
      }
    }
  }

  return Array.from(ids).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Row count per table plus lastSyncedAt/lastRunStatus from the existing SyncStateRepository — no
 * new sync-state query shape. `restrictSubsidiaries` (null = unrestricted/admin) is applied to
 * the count for any entity with a subsidiaryColumn, so a subsidiary-restricted user's dashboard
 * tile shows how many rows THEY can actually see, not the entity's true total.
 */
export async function getEntitySummaries(
  db: Knex,
  configs: EntityConfig[],
  restrictSubsidiaries: Set<string> | null = null,
): Promise<EntitySummary[]> {
  const syncStateRepository = new SyncStateRepository(db);

  return Promise.all(
    configs.map(async (config): Promise<EntitySummary> => {
      const countQuery = db(config.table);
      if (config.subsidiaryColumn && restrictSubsidiaries !== null) {
        applySubsidiaryRestriction(countQuery, config.subsidiaryColumn, restrictSubsidiaries);
      }

      const [countRow, syncState] = await Promise.all([
        countQuery.count({ count: '*' }).first(),
        config.syncEntityName ? syncStateRepository.get(config.syncEntityName) : Promise.resolve(undefined),
      ]);

      const lastSyncedAtRaw = syncState?.last_run_completed_at ?? syncState?.last_watermark ?? null;

      return {
        key: config.key,
        label: config.label,
        rowCount: Number((countRow as { count: number | string } | undefined)?.count ?? 0),
        lastSyncedAt: lastSyncedAtRaw ? new Date(lastSyncedAtRaw).toISOString() : null,
        lastRunStatus: syncState?.last_run_status ?? null,
      };
    }),
  );
}
