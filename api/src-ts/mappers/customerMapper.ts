import type { CustomerRow } from '../repositories/customerRepository';
import { toBool, parseNetSuiteDate, toStringOrNull } from './utils';

export function mapCustomer(raw: Record<string, any>): CustomerRow {
  return {
    netsuite_id: String(raw.id),
    entityid: toStringOrNull(raw.entityid),
    companyname: toStringOrNull(raw.companyname),
    email: toStringOrNull(raw.email),
    phone: toStringOrNull(raw.phone),
    isinactive: toBool(raw.isinactive),
    datecreated: parseNetSuiteDate(raw.datecreated),
    lastmodifieddate: parseNetSuiteDate(raw.lastmodifieddate),
    custentitycustentity_cryo_telefono1: toStringOrNull(raw.custentitycustentity_cryo_telefono1),
    custentitycustentity_cryo_telefono2: toStringOrNull(raw.custentitycustentity_cryo_telefono2),
    custentity_cryo_telefono3: toStringOrNull(raw.custentity_cryo_telefono3),
    custentity_cryo_telefono4: toStringOrNull(raw.custentity_cryo_telefono4),
    custentity3: toStringOrNull(raw.custentity3),
    custentity_cryo_telefono6: toStringOrNull(raw.custentity_cryo_telefono6),
    custentity_cryo_telefono7: toStringOrNull(raw.custentity_cryo_telefono7),
    custentity_cryo_telefono8: toStringOrNull(raw.custentity_cryo_telefono8),
    custentity_cryo_telefono9: toStringOrNull(raw.custentity_cryo_telefono9),
    custentity_cryo_telefono10: toStringOrNull(raw.custentity_cryo_telefono10),
    raw_data: JSON.stringify(raw),
  };
}
