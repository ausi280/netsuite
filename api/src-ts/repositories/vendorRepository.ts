import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface VendorRow {
  netsuite_id: string;
  entityid: string | null;
  companyname: string | null;
  email: string | null;
  phone: string | null;
  subsidiary: string | null;
  isinactive: boolean | null;
  lastmodifieddate: Date | null;
  raw_data: string;
}

export class VendorRepository {
  private readonly table = 'netsuite_vendors';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: VendorRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
