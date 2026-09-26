import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface CustomerRow {
  netsuite_id: string;
  entityid: string | null;
  companyname: string | null;
  email: string | null;
  phone: string | null;
  isinactive: boolean | null;
  datecreated: Date | null;
  lastmodifieddate: Date | null;
  // Every "Teléfono N" custom entity field on Customer (no telefono5 - confirmed live via
  // NetSuite's metadata-catalog schema; telefono1/2's ids really do carry a doubled
  // "custentitycustentity_" prefix, not a typo).
  custentitycustentity_cryo_telefono1: string | null;
  custentitycustentity_cryo_telefono2: string | null;
  custentity_cryo_telefono3: string | null;
  custentity_cryo_telefono4: string | null;
  // "Teléfono 5" - the odd one out: an auto-numbered id, not custentity_cryo_telefono5 (confirmed
  // live via NetSuite's metadata-catalog schema title, not by naming convention).
  custentity3: string | null;
  custentity_cryo_telefono6: string | null;
  custentity_cryo_telefono7: string | null;
  custentity_cryo_telefono8: string | null;
  custentity_cryo_telefono9: string | null;
  custentity_cryo_telefono10: string | null;
  raw_data: string;
}

export class CustomerRepository {
  private readonly table = 'netsuite_customers';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: CustomerRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
