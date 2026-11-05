import type { Knex } from 'knex';
import { getFacturaInicial } from './contratosReportRepository';
import type { ExtraFilter } from './reportingRepository';

/**
 * The generic Contratos grid's (entity 'contracts', plain netsuite_contracts) extra filters and
 * optional "factura inicial" columns - the same ones Reporte Contratos offers
 * (contratosReportRepository.ts), layered onto the generic-entity path instead of a separate query.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_ALTA_DATE_SQL = 'TRY_CONVERT(date, custrecord_cryo_finicio, 103)';

export interface ContractListFilterParams {
  /** Fecha de alta (custrecord_cryo_finicio) range, YYYY-MM-DD, each end optional and inclusive. */
  dateFrom?: unknown;
  dateTo?: unknown;
  /** 'si' / 'no' - custrecord_cryo_saldo_inicial (a T/F flag); anything else = both. */
  saldoInicial?: unknown;
}

export function contractListFilter(params: ContractListFilterParams): ExtraFilter {
  return (qb) => {
    if (typeof params.dateFrom === 'string' && DATE_ONLY.test(params.dateFrom)) qb.whereRaw(`${FECHA_ALTA_DATE_SQL} >= ?`, [params.dateFrom]);
    if (typeof params.dateTo === 'string' && DATE_ONLY.test(params.dateTo)) qb.whereRaw(`${FECHA_ALTA_DATE_SQL} <= ?`, [params.dateTo]);
    if (params.saldoInicial === 'si') qb.where('custrecord_cryo_saldo_inicial', 'T');
    if (params.saldoInicial === 'no') qb.where('custrecord_cryo_saldo_inicial', 'F');
  };
}

export const CONTRACT_FACTURA_COLUMNS = ['factura_inicial', 'factura_sin_iva', 'factura_con_iva', 'docs_completos'] as const;

/** Adds factura_inicial / factura_sin_iva / factura_con_iva / docs_completos to each row, in place. */
export async function addContractFacturaColumns(db: Knex, legacyDb: Knex, rows: Array<Record<string, unknown>>): Promise<void> {
  const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
  const facturas = await getFacturaInicial(
    db,
    legacyDb,
    rows.map((row) => ({
      netsuite_id: String(row.netsuite_id),
      name: str(row.name),
      folio_sistema_anterior: str(row.custrecord_cryo_contratosistemaanterior),
      subsidiaria_id: str(row.custrecord_cryo_subsidiariacontrato),
    })),
  );
  for (const row of rows) Object.assign(row, facturas.get(String(row.netsuite_id)));
}
