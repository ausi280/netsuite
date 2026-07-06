import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface ReceivableRow {
  invoice_netsuite_id: string;
  customer_netsuite_id: string | null;
  amountremaining: number | null;
  currency: string | null;
  trandate: Date | null;
  duedate: Date | null;
  computed_at: Date;
  raw_data: string;
}

/**
 * Receivables are a point-in-time derived fact, not append-only history:
 * a closed invoice must disappear from this table. Each run upserts the
 * currently-open invoices, then prunes rows this run didn't touch.
 */
export class ReceivableRepository {
  private readonly table = 'netsuite_receivables';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: ReceivableRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'invoice_netsuite_id');
  }

  async pruneStale(trx: Knex.Transaction, runStartedAt: Date): Promise<number> {
    return trx(this.table).where('computed_at', '<', runStartedAt).delete();
  }
}
