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
  raw_data: string;
}

export class CustomerRepository {
  private readonly table = 'netsuite_customers';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: CustomerRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
