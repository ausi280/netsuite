import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapVendorTransaction } from '../mappers/vendorTransactionMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { VendorTransactionRow } from '../repositories/vendorTransactionRepository';
import type { SyncEntityName } from '../config/types';

/** VendBill (Factura) + VendPymt (Pago de factura, informally "Orden de Pago") - the two document
 * types shown in a vendor's "Transacciones" subtab. Confirmed live: this account has no other
 * vendor-side transaction types (no VendCred etc.) as of this writing. */
export class VendorTransactionSyncService extends BaseSyncService<RawNetSuiteRecord, VendorTransactionRow> {
  readonly entityName: SyncEntityName = 'vendorTransaction';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('transaction')
      .select('id', 'tranid', 'entity', 'type', 'status', 'trandate', 'duedate', 'currency', 'total', 'foreigntotal', 'lastmodifieddate')
      .where(`type IN ('VendBill', 'VendPymt')`)
      .whereWatermark('lastmodifieddate', watermark, tieBreakId)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): VendorTransactionRow {
    return mapVendorTransaction(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
