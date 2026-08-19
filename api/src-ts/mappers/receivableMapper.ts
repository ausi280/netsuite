import type { ReceivableRow } from '../repositories/receivableRepository';
import { parseNetSuiteDate, toNumber, toStringOrNull } from './utils';

export function mapReceivable(raw: Record<string, any>, computedAt: Date): ReceivableRow {
  return {
    invoice_netsuite_id: String(raw.id),
    customer_netsuite_id: toStringOrNull(raw.entity),
    amountremaining: toNumber(raw.amountremaining),
    currency: toStringOrNull(raw.currency),
    trandate: parseNetSuiteDate(raw.trandate),
    duedate: parseNetSuiteDate(raw.duedate),
    computed_at: computedAt,
    raw_data: JSON.stringify(raw),
  };
}
