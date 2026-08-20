import type { SerialNumberRow } from '../repositories/serialNumberRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapSerialNumber(raw: Record<string, any>): SerialNumberRow {
  return {
    netsuite_id: String(raw.id),
    item_netsuite_id: toStringOrNull(raw.item),
    item_subsidiary_id: toStringOrNull(raw.subsidiary),
    inventory_number: toStringOrNull(raw.inventorynumber),
    lastmodified: toStringOrNull(raw.lastmodifieddate),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodifieddate),
    links: raw.links ? JSON.stringify(raw.links) : null,
    raw_data: JSON.stringify(raw),
  };
}
