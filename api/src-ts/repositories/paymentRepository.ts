import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface PaymentRow {
  netsuite_id: string;
  tranid: string | null;
  customer_id: string | null;
  trandate: Date | null;
  amount: number | null;
  status: string | null;
  currency: string | null;
  lastmodifieddate: Date | null;
  raw_data: string;
}

export class PaymentRepository {
  private readonly table = 'netsuite_payments';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: PaymentRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
