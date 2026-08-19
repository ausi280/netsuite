import type { InvoiceRow } from '../repositories/invoiceRepository';
import { parseNetSuiteDate, toNumber, toStringOrNull } from './utils';

export function mapInvoice(raw: Record<string, any>): InvoiceRow {
  return {
    netsuite_id: String(raw.id),
    tranid: toStringOrNull(raw.tranid),
    entity_id: toStringOrNull(raw.entity),
    trandate: parseNetSuiteDate(raw.trandate),
    duedate: parseNetSuiteDate(raw.duedate),
    status: toStringOrNull(raw.status),
    currency: toStringOrNull(raw.currency),
    total: toNumber(raw.total ?? raw.foreigntotal),
    amountremaining: toNumber(raw.amountremaining),
    lastmodifieddate: parseNetSuiteDate(raw.lastmodifieddate),
    raw_data: JSON.stringify(raw),
  };
}
