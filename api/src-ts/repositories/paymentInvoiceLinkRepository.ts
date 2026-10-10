import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface PaymentInvoiceLinkRow {
  payment_id: string;
  invoice_id: string;
}

export class PaymentInvoiceLinkRepository {
  private readonly table = 'netsuite_payment_invoice_links';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: PaymentInvoiceLinkRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, ['payment_id', 'invoice_id']);
  }
}
