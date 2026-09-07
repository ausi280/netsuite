import type { OtrosContratoRow } from '../repositories/otrosContratoRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapOtrosContrato(raw: Record<string, any>): OtrosContratoRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord_cryo_contrato_otroscontratos: toStringOrNull(raw.custrecord_cryo_contrato_otroscontratos),
    custrecord_cryo_dnititular2_otroscontrat: toStringOrNull(raw.custrecord_cryo_dnititular2_otroscontrat),
    custrecord_cryo_especimen_otroscontratos: toStringOrNull(raw.custrecord_cryo_especimen_otroscontratos),
    custrecord_cryo_estado_otroscontratos: toStringOrNull(raw.custrecord_cryo_estado_otroscontratos),
    custrecord_cryo_fecha_otroscontratos: toStringOrNull(raw.custrecord_cryo_fecha_otroscontratos),
    custrecord_cryo_fechaprobable_otroscontr: toStringOrNull(raw.custrecord_cryo_fechaprobable_otroscontr),
    custrecord_cryo_ginecologo_otroscontrato: toStringOrNull(raw.custrecord_cryo_ginecologo_otroscontrato),
    custrecord_cryo_hospital_otroscontratos: toStringOrNull(raw.custrecord_cryo_hospital_otroscontratos),
    custrecord_cryo_muestra1_otroscontratos: toStringOrNull(raw.custrecord_cryo_muestra1_otroscontratos),
    custrecord_cryo_muestra2_otroscontratos: toStringOrNull(raw.custrecord_cryo_muestra2_otroscontratos),
    custrecord_cryo_otroscontratosmarca: toStringOrNull(raw.custrecord_cryo_otroscontratosmarca),
    custrecord_cryo_servicio_otroscontratos: toStringOrNull(raw.custrecord_cryo_servicio_otroscontratos),
    custrecord_cryo_subsidiaria_otroscontrat: toStringOrNull(raw.custrecord_cryo_subsidiaria_otroscontrat),
    custrecord_cryo_titular2_otroscontratos: toStringOrNull(raw.custrecord_cryo_titular2_otroscontratos),
    custrecord_cryo_titular_otroscontrato: toStringOrNull(raw.custrecord_cryo_titular_otroscontrato),
    custrecord_cryo_vendedor_otroscontratos: toStringOrNull(raw.custrecord_cryo_vendedor_otroscontratos),
    externalid: toStringOrNull(raw.externalid),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
