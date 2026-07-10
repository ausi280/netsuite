import type { FamilyMemberRow } from '../repositories/familyMemberRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapFamilyMember(raw: Record<string, any>): FamilyMemberRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord_cryo_fnacimiento: toStringOrNull(raw.custrecord_cryo_fnacimiento),
    custrecord_cryo_genero: toStringOrNull(raw.custrecord_cryo_genero),
    custrecord_cryo_idfamilia: toStringOrNull(raw.custrecord_cryo_idfamilia),
    custrecord_cryo_main_email: toStringOrNull(raw.custrecord_cryo_main_email),
    custrecord_cryo_miembrotitular: toStringOrNull(raw.custrecord_cryo_miembrotitular),
    custrecord_cryo_mismadireccion: toStringOrNull(raw.custrecord_cryo_mismadireccion),
    custrecord_cryo_no_familia_colombia: toStringOrNull(raw.custrecord_cryo_no_familia_colombia),
    custrecord_cryo_nombremiembro: toStringOrNull(raw.custrecord_cryo_nombremiembro),
    custrecord_cryo_parentesco: toStringOrNull(raw.custrecord_cryo_parentesco),
    custrecord_cryo_titular: toStringOrNull(raw.custrecord_cryo_titular),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
