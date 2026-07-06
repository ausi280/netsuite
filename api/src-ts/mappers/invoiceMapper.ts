import type { InvoiceRow } from '../repositories/invoiceRepository';
import { toDate, toNumber, toStringOrNull } from './utils';

export function mapInvoice(raw: Record<string, any>): InvoiceRow {
  return {
    netsuite_id: String(raw.id),
    tranid: toStringOrNull(raw.tranid),
    entity_id: toStringOrNull(raw.entity),
    trandate: toDate(raw.trandate),
    duedate: toDate(raw.duedate),
    status: toStringOrNull(raw.status),
    currency: toStringOrNull(raw.currency),
    total: toNumber(raw.total ?? raw.foreigntotal),
    amountremaining: toNumber(raw.amountremaining),
    lastmodifieddate: toDate(raw.lastmodifieddate),
    raw_data: JSON.stringify(raw),
  };
}
