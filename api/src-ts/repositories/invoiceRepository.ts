import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface InvoiceRow {
  netsuite_id: string;
  tranid: string | null;
  entity_id: string | null;
  trandate: Date | null;
  duedate: Date | null;
  status: string | null;
  currency: string | null;
  total: number | null;
  amountremaining: number | null;
  lastmodifieddate: Date | null;
  raw_data: string;
}

export class InvoiceRepository {
  private readonly table = 'netsuite_invoices';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: InvoiceRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
