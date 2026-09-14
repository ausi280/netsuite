import type { Knex } from 'knex';
import { applySubsidiaryRestriction, clampPage, clampPageSize, parseSubsidiaryFilter } from './reportingRepository';
import type { Paginated } from './types';

type SortDir = 'asc' | 'desc';

/**
 * Contratos FCells grid, enriched with the vendedor's name - a dedicated repository rather than a
 * generic-config entity, since "Vendedor" isn't a plain column on netsuite_fcells_contratos
 * itself: it's a plain LEFT JOIN to netsuite_employees on custrecord_cryo_vendedorfcells, same
 * simple resolved-name join used elsewhere (e.g. vendor-transactions' vendor name).
 */

const TABLE = 'netsuite_fcells_contratos as F';
const SUBSIDIARY_COLUMN = 'F.custrecord_cryo_subsidiariafcells';

const SELECT_COLUMNS = [
  'F.netsuite_id',
  'F.name',
  'F.custrecord_cryo_estatusfcells',
  'F.custrecord_cryo_productofcells',
  'F.custrecord_cryo_fechaalta',
  'F.custrecord_cryo_pacientefcells',
  'F.custrecord_cryo_vendedorfcells',
  'VEND.entityid as vendedor_nombre',
  'F.custrecord_cryo_subsidiariafcells',
  'F.isinactive',
  'F.lastmodifieddate_dt',
];

const SORTABLE_COLUMNS: Record<string, string> = {
  name: 'F.name',
  custrecord_cryo_fechaalta: 'F.custrecord_cryo_fechaalta',
  lastmodifieddate_dt: 'F.lastmodifieddate_dt',
  vendedor_nombre: 'VEND.entityid',
};
const DEFAULT_SORT_COLUMN = 'F.lastmodifieddate_dt';
const DEFAULT_SORT_DIR: SortDir = 'desc';

function resolveFcellsContratoSort(sortBy: unknown, sortDir: unknown): { column: string; dir: SortDir } {
  const column = typeof sortBy === 'string' && SORTABLE_COLUMNS[sortBy] ? SORTABLE_COLUMNS[sortBy] : DEFAULT_SORT_COLUMN;
  const dir = sortDir === 'asc' || sortDir === 'desc' ? sortDir : DEFAULT_SORT_DIR;
  return { column, dir };
}

function buildBaseQuery(db: Knex, search: string, subsidiary: Set<string>, restrictSubsidiaries: Set<string> | null): Knex.QueryBuilder {
  const qb = db(TABLE).leftJoin('netsuite_employees as VEND', 'VEND.netsuite_id', 'F.custrecord_cryo_vendedorfcells');

  if (search) {
    qb.where((builder) => {
      builder
        .orWhere('F.name', 'like', `%${search}%`)
        .orWhere('VEND.entityid', 'like', `%${search}%`)
        .orWhere('F.custrecord_cryo_muestrafcells', 'like', `%${search}%`)
        .orWhere('F.custrecord_cryo_idexternocontrato', 'like', `%${search}%`);
    });
  }

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  if (subsidiary.size > 0) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, subsidiary);
  }

  return qb;
}

export interface FcellsContratoListParams {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  sortBy?: unknown;
  sortDir?: unknown;
  subsidiary?: unknown;
}

export async function getEnrichedFcellsContratoRows(
  db: Knex,
  params: FcellsContratoListParams,
  restrictSubsidiaries: Set<string> | null,
): Promise<Paginated<Record<string, unknown>>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const { column, dir } = resolveFcellsContratoSort(params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = parseSubsidiaryFilter(params.subsidiary);

  const [rows, countRow] = await Promise.all([
    buildBaseQuery(db, search, subsidiary, restrictSubsidiaries)
      .select(SELECT_COLUMNS)
      .orderBy(column, dir)
      .orderBy('F.netsuite_id', 'asc')
      .offset((page - 1) * pageSize)
      .limit(pageSize),
    buildBaseQuery(db, search, subsidiary, restrictSubsidiaries).count({ count: 'F.netsuite_id' }).first(),
  ]);

  const total = Number((countRow as { count: number | string } | undefined)?.count ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return { data: rows as Record<string, unknown>[], page, pageSize, total, totalPages };
}

/** Same enrichment, unpaginated, for CSV export - mirrors buildEnrichedPartidaExportQuery. */
export function buildFcellsContratoExportQuery(
  db: Knex,
  params: Pick<FcellsContratoListParams, 'search' | 'sortBy' | 'sortDir' | 'subsidiary'>,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const { column, dir } = resolveFcellsContratoSort(params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = parseSubsidiaryFilter(params.subsidiary);

  return buildBaseQuery(db, search, subsidiary, restrictSubsidiaries)
    .select(SELECT_COLUMNS)
    .orderBy(column, dir)
    .orderBy('F.netsuite_id', 'asc');
}

export const FCELLS_CONTRATO_EXPORT_COLUMNS = [
  'netsuite_id',
  'name',
  'custrecord_cryo_estatusfcells',
  'custrecord_cryo_productofcells',
  'custrecord_cryo_fechaalta',
  'custrecord_cryo_pacientefcells',
  'vendedor_nombre',
  'custrecord_cryo_subsidiariafcells',
  'isinactive',
  'lastmodifieddate_dt',
];
