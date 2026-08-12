import type { HospitalRow } from '../repositories/hospitalRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapHospital(raw: Record<string, any>): HospitalRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord1399: toStringOrNull(raw.custrecord1399),
    custrecordcryo_provincias: toStringOrNull(raw.custrecordcryo_provincias),
    externalid: toStringOrNull(raw.externalid),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
