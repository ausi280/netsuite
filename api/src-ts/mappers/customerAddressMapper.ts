import type { CustomerAddressRow } from '../repositories/customerAddressRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapCustomerAddress(raw: Record<string, any>): CustomerAddressRow {
  return {
    netsuite_id: String(raw.id),
    customer_id: toStringOrNull(raw.customer_id),
    label: toStringOrNull(raw.label),
    defaultbilling: toStringOrNull(raw.defaultbilling),
    defaultshipping: toStringOrNull(raw.defaultshipping),
    isresidential: toStringOrNull(raw.isresidential),
    addr1: toStringOrNull(raw.addr1),
    addr2: toStringOrNull(raw.addr2),
    addr3: toStringOrNull(raw.addr3),
    addressee: toStringOrNull(raw.addressee),
    attention: toStringOrNull(raw.attention),
    addrphone: toStringOrNull(raw.addrphone),
    addrtext: toStringOrNull(raw.addrtext),
    city: toStringOrNull(raw.city),
    state: toStringOrNull(raw.state),
    zip: toStringOrNull(raw.zip),
    country: toStringOrNull(raw.country),
    custrecord_colonia: toStringOrNull(raw.custrecord_colonia),
    override: toStringOrNull(raw.override),
    lastmodifieddate: toStringOrNull(raw.lastmodifieddate),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodifieddate),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord_cryo_facturacion: toStringOrNull(raw.custrecord_cryo_facturacion),
    custrecord_cryo_razonsocial: toStringOrNull(raw.custrecord_cryo_razonsocial),
    custrecord_cryo_rfc: toStringOrNull(raw.custrecord_cryo_rfc),
    custrecord_cryo_constanciasitfiscal: toStringOrNull(raw.custrecord_cryo_constanciasitfiscal),
    custrecord_cryo_usocfdi: toStringOrNull(raw.custrecord_cryo_usocfdi),
    custrecord_cryo_regimenfiscal: toStringOrNull(raw.custrecord_cryo_regimenfiscal),
    custrecord_cryo_clientetitular: toStringOrNull(raw.custrecord_cryo_clientetitular),
    raw_data: JSON.stringify(raw),
  };
}
