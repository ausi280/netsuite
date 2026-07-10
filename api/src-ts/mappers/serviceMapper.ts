import type { ServiceRow } from '../repositories/serviceRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapService(raw: Record<string, any>): ServiceRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord_cryo_costo_anual_auto: toStringOrNull(raw.custrecord_cryo_costo_anual_auto),
    custrecord_cryo_costoanualidad: toStringOrNull(raw.custrecord_cryo_costoanualidad),
    custrecord_cryo_estatusservicio: toStringOrNull(raw.custrecord_cryo_estatusservicio),
    custrecord_cryo_estatusservicio_copia: toStringOrNull(raw.custrecord_cryo_estatusservicio_copia),
    custrecord_cryo_fecha_procesoserv: toStringOrNull(raw.custrecord_cryo_fecha_procesoserv),
    custrecord_cryo_idcontrato: toStringOrNull(raw.custrecord_cryo_idcontrato),
    custrecord_cryo_monedaserv: toStringOrNull(raw.custrecord_cryo_monedaserv),
    custrecord_cryo_precioprocesamiento: toStringOrNull(raw.custrecord_cryo_precioprocesamiento),
    custrecord_cryo_serviciocontratado: toStringOrNull(raw.custrecord_cryo_serviciocontratado),
    custrecord_cryo_statuspagoserv: toStringOrNull(raw.custrecord_cryo_statuspagoserv),
    custrecord_cryo_tipodeserv: toStringOrNull(raw.custrecord_cryo_tipodeserv),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
