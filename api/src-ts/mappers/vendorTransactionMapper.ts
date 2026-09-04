import type { VendorTransactionRow } from '../repositories/vendorTransactionRepository';
import { parseNetSuiteDate, toNumber, toStringOrNull } from './utils';

export function mapVendorTransaction(raw: Record<string, any>): VendorTransactionRow {
  return {
    netsuite_id: String(raw.id),
    tranid: toStringOrNull(raw.tranid),
    entity_id: toStringOrNull(raw.entity),
    type: toStringOrNull(raw.type),
    status: toStringOrNull(raw.status),
    trandate: parseNetSuiteDate(raw.trandate),
    duedate: parseNetSuiteDate(raw.duedate),
    currency: toStringOrNull(raw.currency),
    total: toNumber(raw.total),
    foreigntotal: toNumber(raw.foreigntotal),
    lastmodifieddate: parseNetSuiteDate(raw.lastmodifieddate),
    raw_data: JSON.stringify(raw),
  };
}
