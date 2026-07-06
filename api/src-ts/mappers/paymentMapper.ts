import type { PaymentRow } from '../repositories/paymentRepository';
import { toDate, toNumber, toStringOrNull } from './utils';

export function mapPayment(raw: Record<string, any>): PaymentRow {
  return {
    netsuite_id: String(raw.id),
    tranid: toStringOrNull(raw.tranid),
    customer_id: toStringOrNull(raw.entity),
    trandate: toDate(raw.trandate),
    amount: toNumber(raw.total),
    status: toStringOrNull(raw.status),
    currency: toStringOrNull(raw.currency),
    lastmodifieddate: toDate(raw.lastmodifieddate),
    raw_data: JSON.stringify(raw),
  };
}
