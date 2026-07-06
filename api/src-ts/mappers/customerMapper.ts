import type { CustomerRow } from '../repositories/customerRepository';
import { toBool, toDate, toStringOrNull } from './utils';

export function mapCustomer(raw: Record<string, any>): CustomerRow {
  return {
    netsuite_id: String(raw.id),
    entityid: toStringOrNull(raw.entityid),
    companyname: toStringOrNull(raw.companyname),
    email: toStringOrNull(raw.email),
    phone: toStringOrNull(raw.phone),
    isinactive: toBool(raw.isinactive),
    datecreated: toDate(raw.datecreated),
    lastmodifieddate: toDate(raw.lastmodifieddate),
    raw_data: JSON.stringify(raw),
  };
}
