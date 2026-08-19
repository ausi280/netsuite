import type { ServicePackageRow } from '../repositories/servicePackageRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapServicePackage(raw: Record<string, any>): ServicePackageRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord1: toStringOrNull(raw.custrecord1),
    custrecord_cryo_articulodescuento: toStringOrNull(raw.custrecord_cryo_articulodescuento),
    custrecord_cryo_articulopaquete: toStringOrNull(raw.custrecord_cryo_articulopaquete),
    custrecord_cryo_artanualidad: toStringOrNull(raw.custrecord_cryo_artanualidad),
    custrecord_cryo_costoinscripcion: toStringOrNull(raw.custrecord_cryo_costoinscripcion),
    custrecord_cryo_costoprocesamiento: toStringOrNull(raw.custrecord_cryo_costoprocesamiento),
    custrecord_cryo_descuentoimportepaquete: toStringOrNull(raw.custrecord_cryo_descuentoimportepaquete),
    custrecord_cryo_descuentopaquete: toStringOrNull(raw.custrecord_cryo_descuentopaquete),
    custrecord_cryo_fecha_precios: toStringOrNull(raw.custrecord_cryo_fecha_precios),
    custrecord_cryo_kit: toStringOrNull(raw.custrecord_cryo_kit),
    custrecord_cryo_kitpaquete: toStringOrNull(raw.custrecord_cryo_kitpaquete),
    custrecord_cryo_marcaservicio: toStringOrNull(raw.custrecord_cryo_marcaservicio),
    custrecord_cryo_monedaservicio: toStringOrNull(raw.custrecord_cryo_monedaservicio),
    custrecord_cryo_pe_monedaanualidad: toStringOrNull(raw.custrecord_cryo_pe_monedaanualidad),
    custrecord_cryo_pe_seguridadtotal: toStringOrNull(raw.custrecord_cryo_pe_seguridadtotal),
    custrecord_cryo_preciototalpaquete: toStringOrNull(raw.custrecord_cryo_preciototalpaquete),
    custrecord_cryo_subsidiariapaquete: toStringOrNull(raw.custrecord_cryo_subsidiariapaquete),
    custrecord_cryo_tipocambio: toStringOrNull(raw.custrecord_cryo_tipocambio),
    custrecord_cryo_tipodeservicio: toStringOrNull(raw.custrecord_cryo_tipodeservicio),
    externalid: toStringOrNull(raw.externalid),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
