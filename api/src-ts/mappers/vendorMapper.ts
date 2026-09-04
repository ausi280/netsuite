import type { VendorRow } from '../repositories/vendorRepository';
import { toBool, parseNetSuiteDate, toStringOrNull } from './utils';

export function mapVendor(raw: Record<string, any>): VendorRow {
  return {
    netsuite_id: String(raw.id),
    entityid: toStringOrNull(raw.entityid),
    companyname: toStringOrNull(raw.companyname),
    email: toStringOrNull(raw.email),
    phone: toStringOrNull(raw.phone),
    subsidiary: toStringOrNull(raw.subsidiary),
    isinactive: toBool(raw.isinactive),
    lastmodifieddate: parseNetSuiteDate(raw.lastmodifieddate),
    raw_data: JSON.stringify(raw),
  };
}
