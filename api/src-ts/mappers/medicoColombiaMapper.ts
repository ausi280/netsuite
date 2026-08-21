import type { MedicoColombiaRow } from '../repositories/medicoColombiaRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapMedicoColombia(raw: Record<string, any>): MedicoColombiaRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord_cryo_ciudadmedicos: toStringOrNull(raw.custrecord_cryo_ciudadmedicos),
    custrecord_cryo_tipodocumento: toStringOrNull(raw.custrecord_cryo_tipodocumento),
    custrecord_cryo_numdocumento: toStringOrNull(raw.custrecord_cryo_numdocumento),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
