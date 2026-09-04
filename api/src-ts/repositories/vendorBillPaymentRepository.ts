import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface VendorBillPaymentRow {
  previousdoc: string;
  nextdoc: string;
  linktype: string | null;
  computed_at: Date;
}

/** The real "which payment paid this bill" link (NetSuite's NextTransactionLink, linktype='Payment',
 * scoped to previousdoc being a VendBill) - not append-only, so pruned like netsuite_receivables. */
export class VendorBillPaymentRepository {
  private readonly table = 'netsuite_vendor_bill_payments';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: VendorBillPaymentRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, ['previousdoc', 'nextdoc']);
  }

  async pruneStale(trx: Knex.Transaction, runStartedAt: Date): Promise<number> {
    // SQL Server's DATETIME column rounds on write - a row written with computed_at =
    // runStartedAt can round-trip to a stored value a few ms LESS than the exact JS Date used
    // here, so a naive `< runStartedAt` prunes rows this very run just wrote (confirmed live:
    // .654 round-tripped to .653). A 1-minute buffer safely absorbs that rounding without
    // letting genuinely stale rows from a meaningfully earlier run survive.
    const safeThreshold = new Date(runStartedAt.getTime() - 60_000);
    return trx(this.table).where('computed_at', '<', safeThreshold).delete();
  }
}
