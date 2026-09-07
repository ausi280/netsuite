import type { PeServicioRow } from '../repositories/peServicioRepository';
import { parseNetSuiteDate, toNumber, toStringOrNull } from './utils';

export function mapPeServicio(raw: Record<string, any>): PeServicioRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord_cryo_idinternoarticulo: toStringOrNull(raw.custrecord_cryo_idinternoarticulo),
    custrecord_cryo_monedaprecio: toStringOrNull(raw.custrecord_cryo_monedaprecio),
    custrecord_cryo_pe_articulo: toStringOrNull(raw.custrecord_cryo_pe_articulo),
    custrecord_cryo_pe_subsidiaria: toStringOrNull(raw.custrecord_cryo_pe_subsidiaria),
    custrecord_cryo_precioservicio: toNumber(raw.custrecord_cryo_precioservicio),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
