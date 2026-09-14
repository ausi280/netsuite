import type { Knex } from 'knex';
import type { NetSuiteHttpClient } from '../http/netsuiteHttpClient';

// The contract custom record's internal script id in NetSuite - confirmed via netsuiteService.js
// (the legacy sync writer) and erpController.js's existing updateContractFechas endpoint, which
// already PATCHes this same record type for a different pair of fields.
const CONTRACT_RECORD_TYPE = 'customrecord1184';

export interface ContractEditableFields {
  /** custrecord_cryo_contratosistemaanterior - the legacy CryoCell system's folio (plain text). */
  folioSistemaAnterior?: string | null;
  /** custrecord_cryo_vendedor - a NetSuite employee internal id (list/record-reference field). */
  vendedorId?: string | null;
}

export interface ContractSubsidiaryLookup {
  netsuite_id: string;
  subsidiaria_id: string | null;
}

/** Just enough to enforce the subsidiary permission check before writing - the full dossier
 * (resolved names, services, annuities) is re-fetched by the frontend via useContractDossier's
 * cache invalidation after a successful save, not duplicated here. */
export async function getContractSubsidiary(db: Knex, netsuiteId: string): Promise<ContractSubsidiaryLookup | null> {
  const row = await db('netsuite_contracts')
    .where('netsuite_id', netsuiteId)
    .select('netsuite_id', 'custrecord_cryo_subsidiariacontrato as subsidiaria_id')
    .first();
  return row ?? null;
}

export interface VendedorOption {
  netsuite_id: string;
  entityid: string | null;
}

/** Every employee (id + display name), for the "Vendedor" edit field's picker - a small, self-
 * contained lookup under the 'contracts' permission rather than requiring the separate 'employees'
 * permission just to reassign a contract's salesperson. */
export async function listVendedorOptions(db: Knex): Promise<VendedorOption[]> {
  return db('netsuite_employees').select('netsuite_id', 'entityid').orderBy('entityid', 'asc');
}

/**
 * Writes the two editable contract fields back to NetSuite (source of truth) via the REST Record
 * API, then mirrors the same values into the local netsuite_contracts row so the reporting UI
 * reflects the change immediately, without waiting for the next scheduled contract sync.
 *
 * NetSuite's REST Record API expects list/record-reference fields (custrecord_cryo_vendedor) as
 * `{ id: "<internal id>" }`, and `null` to clear them - unlike a plain scalar field
 * (custrecord_cryo_contratosistemaanterior), which is sent/cleared as a bare string/null.
 */
export async function updateContractFields(
  db: Knex,
  http: NetSuiteHttpClient,
  netsuiteId: string,
  fields: ContractEditableFields,
): Promise<void> {
  const netsuiteBody: Record<string, unknown> = {};
  const localUpdate: Record<string, unknown> = {};

  if ('folioSistemaAnterior' in fields) {
    netsuiteBody.custrecord_cryo_contratosistemaanterior = fields.folioSistemaAnterior;
    localUpdate.custrecord_cryo_contratosistemaanterior = fields.folioSistemaAnterior;
  }
  if ('vendedorId' in fields) {
    netsuiteBody.custrecord_cryo_vendedor = fields.vendedorId ? { id: fields.vendedorId } : null;
    localUpdate.custrecord_cryo_vendedor = fields.vendedorId ?? null;
  }

  if (Object.keys(netsuiteBody).length === 0) return;

  await http.patchRecord(CONTRACT_RECORD_TYPE, netsuiteId, netsuiteBody);
  await db('netsuite_contracts').where('netsuite_id', netsuiteId).update(localUpdate);
}
