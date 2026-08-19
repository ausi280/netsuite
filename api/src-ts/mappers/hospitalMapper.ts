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
    custrecord_hospitales_subsidiria: toStringOrNull(raw.custrecord_hospitales_subsidiria),
    custrecord_cryo_provinciaarg: toStringOrNull(raw.custrecord_cryo_provinciaarg),
    custrecord_cryo_direccionhospital: toStringOrNull(raw.custrecord_cryo_direccionhospital),
    externalid: toStringOrNull(raw.externalid),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
