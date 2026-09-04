import type { Knex } from 'knex';
import { applySubsidiaryRestriction, clampPage, clampPageSize } from './reportingRepository';
import type { Paginated } from './types';

type SortDir = 'asc' | 'desc';

/**
 * Partidas grid, enriched with the parent contract's name and its "dueño" (owner) - a dedicated
 * repository rather than a generic-config extension of getPagedRows, since the join collides on
 * column names (both netsuite_partidas and netsuite_contracts have `name`/`netsuite_id`/etc) and
 * no other entity's list view needs a cross-table join today. Kept parallel to getPagedRows
 * (same page/pageSize/search/sortBy/sortDir/subsidiary contract) so the controller can swap in
 * this function for the 'partidas' entity key alone, with every other entity untouched.
 */

const TABLE = 'netsuite_partidas as P';
const SUBSIDIARY_COLUMN = 'P.custrecord_cryo_subsidiaria_partida';

const SELECT_COLUMNS = [
  'P.netsuite_id',
  'P.name',
  'P.custrecord_cryo_concepto',
  'P.custrecord_cryo_estatuspartida',
  'P.custrecord_cryo_importepartida',
  'P.custrecord_cryo_monedapartida',
  'P.custrecord_cryo_fechapartida',
  'P.custrecord_cryo_numcontrato',
  'P.custrecord_cryo_subsidiaria_partida',
  'P.isinactive',
  'P.lastmodifieddate_dt',
  'CONTRACT.name as contract_name',
  'EMP.entityid as dueno_nombre',
];

// Request-supplied sortBy is only ever resolved against this allow-list, exactly like
// resolveSort() in reportingRepository.ts - never against arbitrary request input.
const SORTABLE_COLUMNS: Record<string, string> = {
  name: 'P.name',
  custrecord_cryo_fechapartida: 'P.custrecord_cryo_fechapartida',
  custrecord_cryo_importepartida: 'P.custrecord_cryo_importepartida',
  lastmodifieddate_dt: 'P.lastmodifieddate_dt',
  contract_name: 'CONTRACT.name',
  dueno_nombre: 'EMP.entityid',
};
const DEFAULT_SORT_COLUMN = 'P.lastmodifieddate_dt';
const DEFAULT_SORT_DIR: SortDir = 'desc';

function resolvePartidaSort(sortBy: unknown, sortDir: unknown): { column: string; dir: SortDir } {
  const column = typeof sortBy === 'string' && SORTABLE_COLUMNS[sortBy] ? SORTABLE_COLUMNS[sortBy] : DEFAULT_SORT_COLUMN;
  const dir = sortDir === 'asc' || sortDir === 'desc' ? sortDir : DEFAULT_SORT_DIR;
  return { column, dir };
}

function buildBaseQuery(
  db: Knex,
  search: string,
  subsidiary: string,
  estatus: string,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const qb = db(TABLE)
    .leftJoin('netsuite_contracts as CONTRACT', 'CONTRACT.netsuite_id', 'P.custrecord_cryo_numcontrato')
    .leftJoin('netsuite_employees as EMP', 'EMP.netsuite_id', 'CONTRACT.custrecord_cryo_duenio');

  if (search) {
    qb.where((builder) => {
      builder
        .orWhere('P.name', 'like', `%${search}%`)
        .orWhere('P.custrecord_cryo_concepto', 'like', `%${search}%`)
        .orWhere('P.custrecord_cryo_numcontrato', 'like', `%${search}%`)
        .orWhere('CONTRACT.name', 'like', `%${search}%`)
        .orWhere('EMP.entityid', 'like', `%${search}%`);
    });
  }

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  if (subsidiary) {
    qb.andWhereRaw(`(',' + REPLACE(CAST(?? AS NVARCHAR(MAX)), ' ', '') + ',') LIKE ?`, [SUBSIDIARY_COLUMN, `%,${subsidiary},%`]);
  }
  if (estatus) {
    qb.andWhere('P.custrecord_cryo_estatuspartida', estatus);
  }

  return qb;
}

export interface PartidaListParams {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  sortBy?: unknown;
  sortDir?: unknown;
  subsidiary?: unknown;
  estatus?: unknown;
}

export async function getEnrichedPartidaRows(
  db: Knex,
  params: PartidaListParams,
  restrictSubsidiaries: Set<string> | null,
): Promise<Paginated<Record<string, unknown>>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const { column, dir } = resolvePartidaSort(params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = typeof params.subsidiary === 'string' ? params.subsidiary.trim() : '';
  const estatus = typeof params.estatus === 'string' ? params.estatus.trim() : '';

  const [rows, countRow] = await Promise.all([
    buildBaseQuery(db, search, subsidiary, estatus, restrictSubsidiaries)
      .select(SELECT_COLUMNS)
      .orderBy(column, dir)
      .orderBy('P.netsuite_id', 'asc')
      .offset((page - 1) * pageSize)
      .limit(pageSize),
    buildBaseQuery(db, search, subsidiary, estatus, restrictSubsidiaries).count({ count: 'P.netsuite_id' }).first(),
  ]);

  const total = Number((countRow as { count: number | string } | undefined)?.count ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return { data: rows as Record<string, unknown>[], page, pageSize, total, totalPages };
}

/** Same enrichment, unpaginated, for CSV export - mirrors reportingRepository's buildExportQuery. */
export function buildEnrichedPartidaExportQuery(
  db: Knex,
  params: Pick<PartidaListParams, 'search' | 'sortBy' | 'sortDir' | 'subsidiary' | 'estatus'>,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const { column, dir } = resolvePartidaSort(params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = typeof params.subsidiary === 'string' ? params.subsidiary.trim() : '';
  const estatus = typeof params.estatus === 'string' ? params.estatus.trim() : '';

  return buildBaseQuery(db, search, subsidiary, estatus, restrictSubsidiaries)
    .select(SELECT_COLUMNS)
    .orderBy(column, dir)
    .orderBy('P.netsuite_id', 'asc');
}

export const PARTIDA_LIST_EXPORT_COLUMNS = [
  'netsuite_id',
  'name',
  'custrecord_cryo_concepto',
  'custrecord_cryo_estatuspartida',
  'custrecord_cryo_importepartida',
  'custrecord_cryo_monedapartida',
  'custrecord_cryo_fechapartida',
  'custrecord_cryo_numcontrato',
  'contract_name',
  'dueno_nombre',
  'custrecord_cryo_subsidiaria_partida',
  'isinactive',
  'lastmodifieddate_dt',
];
