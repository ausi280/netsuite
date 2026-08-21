import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_ginecologo` (display name "Médicos (Colombia)" -
 * the scriptid still carries the record's original name). Separate schema
 * from `customrecord_cryo_medicos` (no subsidiary field, has document-type
 * fields instead), so it's a distinct table rather than a shared one.
 */
export interface MedicoColombiaRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord_cryo_ciudadmedicos: string | null;
  custrecord_cryo_tipodocumento: string | null;
  custrecord_cryo_numdocumento: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  recordid: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class MedicoColombiaRepository {
  private readonly table = 'netsuite_medicos_colombia';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: MedicoColombiaRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
