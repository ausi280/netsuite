import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface VendorTransactionRow {
  netsuite_id: string;
  tranid: string | null;
  entity_id: string | null;
  type: string | null;
  status: string | null;
  trandate: Date | null;
  duedate: Date | null;
  currency: string | null;
  total: number | null;
  foreigntotal: number | null;
  lastmodifieddate: Date | null;
  raw_data: string;
}

/** VendBill (Factura) and VendPymt (Pago de factura) transactions - the two document types shown
 * in a vendor's "Transacciones" subtab in NetSuite. */
export class VendorTransactionRepository {
  private readonly table = 'netsuite_vendor_transactions';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: VendorTransactionRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
