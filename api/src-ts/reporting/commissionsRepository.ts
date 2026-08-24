import type { Knex } from 'knex';
import { applySubsidiaryRestriction } from './reportingRepository';

export interface CommissionRow {
  netsuite_id: string;
  name: string | null;
  numero_contrato: string | null;
  fecha_inicio: string | null;
  estatus: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  vendedor_id: string;
  vendedor_nombre: string | null;
  saldo_inicial: string | null;
  total: number | null;
}

const SUBSIDIARY_COLUMN = 'C.custrecord_cryo_subsidiariacontrato';
// custrecord_cryo_finicio is a raw NetSuite locale date string ("DD/MM/YYYY", confirmed 100%
// parseable on this table, same as the other custom-record date fields handled this session).
const FECHA_INICIO_DATE_SQL = `TRY_CONVERT(date, C.custrecord_cryo_finicio, 103)`;

/**
 * New-contract sales commissions: every contract with a salesperson (custrecord_cryo_vendedor)
 * whose start date (custrecord_cryo_finicio) falls in the given month/year, salesperson name
 * resolved via netsuite_employees. Contracts with no vendedor assigned are excluded - there's no
 * commission to pay on them.
 */
export async function getNewContractCommissions(
  db: Knex,
  month: number,
  year: number,
  restrictSubsidiaries: Set<string> | null,
  subsidiary?: string,
): Promise<CommissionRow[]> {
  const qb = db('netsuite_contracts as C')
    .leftJoin('netsuite_customers as CUST', 'CUST.netsuite_id', 'C.custrecord_cryo_titularcontrato')
    .leftJoin('netsuite_employees as VEND', 'VEND.netsuite_id', 'C.custrecord_cryo_vendedor')
    .whereNotNull('C.custrecord_cryo_vendedor')
    .whereRaw(`MONTH(${FECHA_INICIO_DATE_SQL}) = ?`, [month])
    .whereRaw(`YEAR(${FECHA_INICIO_DATE_SQL}) = ?`, [year])
    .select(
      'C.netsuite_id',
      'C.name',
      'C.custrecord_cryo_numerocontrato as numero_contrato',
      'C.custrecord_cryo_finicio as fecha_inicio',
      'C.custrecord_cryo_estatus as estatus',
      'C.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
      'CUST.companyname as titular_nombre',
      'C.custrecord_cryo_vendedor as vendedor_id',
      'VEND.entityid as vendedor_nombre',
      'C.custrecord_cryo_saldo_inicial as saldo_inicial',
      'C.raw_data',
    )
    .orderBy('VEND.entityid')
    .orderBy('C.custrecord_cryo_finicio');

  // Permission-based restriction (null = unrestricted/admin) and the caller's requested single
  // subsidiary filter are independent, AND'd conditions - same convention as getPagedRows: the
  // requested filter can only narrow within what the caller is already allowed to see.
  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  if (subsidiary) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, new Set([subsidiary]));
  }

  const rows = (await qb) as Array<CommissionRow & { raw_data: string }>;

  // Same reasoning as the contract dossier: custrecord_cryo_total isn't a curated column, but
  // it's in raw_data since the sync fetches the full record.
  return rows.map(({ raw_data, ...rest }) => {
    let total: number | null = null;
    try {
      const raw = JSON.parse(raw_data);
      total = raw.custrecord_cryo_total != null ? Number(raw.custrecord_cryo_total) : null;
    } catch {
      // leave total null
    }
    return { ...rest, total };
  });
}
