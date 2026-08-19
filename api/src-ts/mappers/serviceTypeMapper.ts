import type { ServiceTypeRow } from '../repositories/serviceTypeRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapServiceType(raw: Record<string, any>): ServiceTypeRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    isinactive: toStringOrNull(raw.isinactive),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
