import type { Knex } from 'knex';
import { applySubsidiaryRestriction, clampPage, clampPageSize, parseSubsidiaryFilter } from './reportingRepository';
import type { Paginated } from './types';

type SortDir = 'asc' | 'desc';

/**
 * Otros Contratos grid, enriched with the linked "Servicio" (customrecord_cryo_pe_servicios) name
 * and price - a dedicated repository rather than a generic-config entity, since "Monto" isn't a
 * plain column on netsuite_otros_contratos itself: it's the joined service package's
 * custrecord_cryo_precioservicio (confirmed via the NetSuite REST record API's expanded link,
 * e.g. servicio id 2 -> "ADN+ SANGRE" -> netsuite_pe_servicios.custrecord_cryo_precioservicio).
 *
 * Also joins the vendedor's name (netsuite_employees, same as fcellsContratoListRepository.ts), and
 * reads "Vía" (custrecord_cryo_mx_via - a free-text code like "VIA065351", Mexico records only, 73
 * of 426 at last count) straight out of raw_data, since it was never given a column of its own.
 * Filterable by a date range on the contract's own Fecha (custrecord_cryo_fecha_otroscontratos -
 * DD/MM/YYYY text, confirmed to parse on every row).
 */

const TABLE = 'netsuite_otros_contratos as O';
const FECHA_SQL = 'TRY_CONVERT(date, O.custrecord_cryo_fecha_otroscontratos, 103)';
const VIA_SQL = "JSON_VALUE(O.raw_data, '$.custrecord_cryo_mx_via')";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const SUBSIDIARY_COLUMN = 'O.custrecord_cryo_subsidiaria_otroscontrat';

const SELECT_COLUMNS = [
  'O.netsuite_id',
  'O.name',
  'O.custrecord_cryo_estado_otroscontratos',
  'O.custrecord_cryo_fecha_otroscontratos',
  'O.custrecord_cryo_fechaprobable_otroscontr',
  'O.custrecord_cryo_hospital_otroscontratos',
  'O.custrecord_cryo_titular_otroscontrato',
  'O.custrecord_cryo_vendedor_otroscontratos',
  'VEND.entityid as vendedor_nombre',
  'O.custrecord_cryo_subsidiaria_otroscontrat',
  'O.isinactive',
  'O.lastmodifieddate_dt',
  'PS.name as servicio_nombre',
  'PS.custrecord_cryo_precioservicio as monto',
  'PS.custrecord_cryo_monedaprecio as moneda',
];

const SORTABLE_COLUMNS: Record<string, string> = {
  name: 'O.name',
  custrecord_cryo_fecha_otroscontratos: 'O.custrecord_cryo_fecha_otroscontratos',
  lastmodifieddate_dt: 'O.lastmodifieddate_dt',
  monto: 'PS.custrecord_cryo_precioservicio',
  vendedor_nombre: 'VEND.entityid',
};
const DEFAULT_SORT_COLUMN = 'O.lastmodifieddate_dt';
const DEFAULT_SORT_DIR: SortDir = 'desc';

function resolveOtrosContratoSort(sortBy: unknown, sortDir: unknown): { column: string; dir: SortDir } {
  const column = typeof sortBy === 'string' && SORTABLE_COLUMNS[sortBy] ? SORTABLE_COLUMNS[sortBy] : DEFAULT_SORT_COLUMN;
  const dir = sortDir === 'asc' || sortDir === 'desc' ? sortDir : DEFAULT_SORT_DIR;
  return { column, dir };
}

function dateParam(value: unknown): string | null {
  return typeof value === 'string' && DATE_ONLY.test(value) ? value : null;
}

function buildBaseQuery(
  db: Knex,
  search: string,
  subsidiary: Set<string>,
  restrictSubsidiaries: Set<string> | null,
  dateFrom: string | null,
  dateTo: string | null,
): Knex.QueryBuilder {
  const qb = db(TABLE)
    .leftJoin('netsuite_pe_servicios as PS', 'PS.netsuite_id', 'O.custrecord_cryo_servicio_otroscontratos')
    .leftJoin('netsuite_employees as VEND', 'VEND.netsuite_id', 'O.custrecord_cryo_vendedor_otroscontratos');

  if (search) {
    qb.where((builder) => {
      builder
        .orWhere('O.name', 'like', `%${search}%`)
        .orWhere('PS.name', 'like', `%${search}%`)
        .orWhere('VEND.entityid', 'like', `%${search}%`)
        .orWhereRaw(`${VIA_SQL} LIKE ?`, [`%${search}%`]);
    });
  }
  // Inclusive on both ends - Fecha is a plain date (no time part), so no next-day bound is needed.
  if (dateFrom) qb.andWhereRaw(`${FECHA_SQL} >= ?`, [dateFrom]);
  if (dateTo) qb.andWhereRaw(`${FECHA_SQL} <= ?`, [dateTo]);

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  if (subsidiary.size > 0) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, subsidiary);
  }

  return qb;
}

export interface OtrosContratoListParams {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  sortBy?: unknown;
  sortDir?: unknown;
  subsidiary?: unknown;
  /** YYYY-MM-DD, inclusive - on the contract's Fecha (custrecord_cryo_fecha_otroscontratos). */
  dateFrom?: unknown;
  dateTo?: unknown;
}

export async function getEnrichedOtrosContratoRows(
  db: Knex,
  params: OtrosContratoListParams,
  restrictSubsidiaries: Set<string> | null,
): Promise<Paginated<Record<string, unknown>>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const { column, dir } = resolveOtrosContratoSort(params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = parseSubsidiaryFilter(params.subsidiary);
  const dateFrom = dateParam(params.dateFrom);
  const dateTo = dateParam(params.dateTo);

  const [rows, countRow] = await Promise.all([
    buildBaseQuery(db, search, subsidiary, restrictSubsidiaries, dateFrom, dateTo)
      .select(SELECT_COLUMNS)
      .select(db.raw(`${VIA_SQL} as via`))
      .orderBy(column, dir)
      .orderBy('O.netsuite_id', 'asc')
      .offset((page - 1) * pageSize)
      .limit(pageSize),
    buildBaseQuery(db, search, subsidiary, restrictSubsidiaries, dateFrom, dateTo).count({ count: 'O.netsuite_id' }).first(),
  ]);

  const total = Number((countRow as { count: number | string } | undefined)?.count ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return { data: rows as Record<string, unknown>[], page, pageSize, total, totalPages };
}

/** Same enrichment, unpaginated, for CSV export - mirrors buildEnrichedPartidaExportQuery. */
export function buildOtrosContratoExportQuery(
  db: Knex,
  params: Pick<OtrosContratoListParams, 'search' | 'sortBy' | 'sortDir' | 'subsidiary' | 'dateFrom' | 'dateTo'>,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const { column, dir } = resolveOtrosContratoSort(params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = parseSubsidiaryFilter(params.subsidiary);

  return buildBaseQuery(db, search, subsidiary, restrictSubsidiaries, dateParam(params.dateFrom), dateParam(params.dateTo))
    .select(SELECT_COLUMNS)
    .select(db.raw(`${VIA_SQL} as via`))
    .orderBy(column, dir)
    .orderBy('O.netsuite_id', 'asc');
}

export const OTROS_CONTRATO_EXPORT_COLUMNS = [
  'netsuite_id',
  'name',
  'custrecord_cryo_estado_otroscontratos',
  'servicio_nombre',
  'monto',
  'custrecord_cryo_fecha_otroscontratos',
  'custrecord_cryo_fechaprobable_otroscontr',
  'via',
  'vendedor_nombre',
  'custrecord_cryo_subsidiaria_otroscontrat',
  'isinactive',
  'lastmodifieddate_dt',
];
