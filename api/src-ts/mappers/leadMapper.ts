import type { LeadRow } from '../repositories/leadRepository';
import { toBool, parseNetSuiteDate, toStringOrNull } from './utils';

export function mapLead(raw: Record<string, any>): LeadRow {
  return {
    netsuite_id: String(raw.id),
    entityid: toStringOrNull(raw.entityid),
    subsidiary: toStringOrNull(raw.subsidiary),
    stage: toStringOrNull(raw.stage),
    entitystatus: toStringOrNull(raw.entitystatus),
    entitystatus_nombre: toStringOrNull(raw.entitystatus_nombre),
    custentity_cryo_canalingreso: toStringOrNull(raw.custentity_cryo_canalingreso),
    canalingreso_nombre: toStringOrNull(raw.canalingreso_nombre),
    custentity_cryo_col_estadolead: toStringOrNull(raw.custentity_cryo_col_estadolead),
    estadolead_nombre: toStringOrNull(raw.estadolead_nombre),
    custentity_cryo_motivoperdida: toStringOrNull(raw.custentity_cryo_motivoperdida),
    motivoperdida_nombre: toStringOrNull(raw.motivoperdida_nombre),
    custentity_nso_lead_marca: toStringOrNull(raw.custentity_nso_lead_marca),
    marca_nombre: toStringOrNull(raw.marca_nombre),
    custentity_cryo_campana: toStringOrNull(raw.custentity_cryo_campana),
    isinactive: toBool(raw.isinactive),
    dategrosslead: parseNetSuiteDate(raw.dategrosslead),
    dateconversion: parseNetSuiteDate(raw.dateconversion),
    datecreated: parseNetSuiteDate(raw.datecreated),
    lastmodifieddate: parseNetSuiteDate(raw.lastmodifieddate),
    raw_data: JSON.stringify(raw),
  };
}
