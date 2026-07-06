import type { ReceivableRow } from '../repositories/receivableRepository';
import { toDate, toNumber, toStringOrNull } from './utils';

export function mapReceivable(raw: Record<string, any>, computedAt: Date): ReceivableRow {
  return {
    invoice_netsuite_id: String(raw.id),
    customer_netsuite_id: toStringOrNull(raw.entity),
    amountremaining: toNumber(raw.amountremaining),
    currency: toStringOrNull(raw.currency),
    trandate: toDate(raw.trandate),
    duedate: toDate(raw.duedate),
    computed_at: computedAt,
    raw_data: JSON.stringify(raw),
  };
}
