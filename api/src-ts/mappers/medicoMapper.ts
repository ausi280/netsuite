import type { MedicoRow } from '../repositories/medicoRepository';
import { parseNetSuiteDate, toStringOrNull } from './utils';

export function mapMedico(raw: Record<string, any>): MedicoRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: parseNetSuiteDate(raw.lastmodified),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord_cryo_ciudadmedico: toStringOrNull(raw.custrecord_cryo_ciudadmedico),
    custrecord_cryo_correomedico: toStringOrNull(raw.custrecord_cryo_correomedico),
    custrecord_cryo_cuit: toStringOrNull(raw.custrecord_cryo_cuit),
    custrecord_cryo_generomedico: toStringOrNull(raw.custrecord_cryo_generomedico),
    custrecord_cryo_marca_medicos: toStringOrNull(raw.custrecord_cryo_marca_medicos),
    custrecord_cryo_subsidiariamedico: toStringOrNull(raw.custrecord_cryo_subsidiariamedico),
    custrecord_cryo_telefonomedico: toStringOrNull(raw.custrecord_cryo_telefonomedico),
    externalid: toStringOrNull(raw.externalid),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
