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
    custbody_cryo_numcontrato: toStringOrNull(raw.custbody_cryo_numcontrato),
    custbody_cryo_cobrador: toStringOrNull(raw.custbody_cryo_cobrador),
    custbody_cryo_duenio: toStringOrNull(raw.custbody_cryo_duenio),
    custbody_cryo_fecha_emision: parseNetSuiteDate(raw.custbody_cryo_fecha_emision),
    raw_data: JSON.stringify(raw),
  };
}
