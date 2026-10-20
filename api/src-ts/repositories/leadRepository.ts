import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/** One NetSuite lead (a customer record with dategrosslead set) - see the migration
 * 20261019000001_create_netsuite_leads_table.js. Each list field carries its internal id plus its
 * BUILTIN.DF display text (`*_nombre`). */
export interface LeadRow {
  netsuite_id: string;
  entityid: string | null;
  subsidiary: string | null;
  stage: string | null;
  entitystatus: string | null;
  entitystatus_nombre: string | null;
  custentity_cryo_canalingreso: string | null;
  canalingreso_nombre: string | null;
  custentity_cryo_col_estadolead: string | null;
  estadolead_nombre: string | null;
  custentity_cryo_motivoperdida: string | null;
  motivoperdida_nombre: string | null;
  custentity_nso_lead_marca: string | null;
  marca_nombre: string | null;
  custentity_cryo_campana: string | null;
  isinactive: boolean | null;
  dategrosslead: Date | null;
  dateconversion: Date | null;
  datecreated: Date | null;
  lastmodifieddate: Date | null;
  raw_data: string;
}

export class LeadRepository {
  private readonly table = 'netsuite_leads';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: LeadRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
