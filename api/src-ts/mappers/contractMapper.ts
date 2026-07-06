import type { ContractRow } from '../repositories/contractRepository';
import { toDate, toStringOrNull } from './utils';

/**
 * Mirrors the legacy field-by-field mapping in
 * netsuiteService.js:180-228 exactly, so the shared `netsuite_records`
 * table keeps a consistent column set whether written by the legacy JS
 * full sync or this incremental TS sync.
 */
export function mapContract(raw: Record<string, any>): ContractRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    created: toStringOrNull(raw.created),
    lastmodified: toStringOrNull(raw.lastmodified),
    lastmodifieddate_dt: toDate(raw.lastmodified),
    custrecord_cryo_contratosistemaanterior: toStringOrNull(raw.custrecord_cryo_contratosistemaanterior),
    custrecord_cryo_numerocontrato: toStringOrNull(raw.custrecord_cryo_numerocontrato),
    custrecord_nso_token: toStringOrNull(raw.custrecord_nso_token),
    links: raw.links ? JSON.stringify(raw.links) : null,
    custrecord_cryo_actualizar_fecha: toStringOrNull(raw.custrecord_cryo_actualizar_fecha),
    custrecord_cryo_aniosanticipados: toStringOrNull(raw.custrecord_cryo_aniosanticipados),
    custrecord_cryo_articulobonif: toStringOrNull(raw.custrecord_cryo_articulobonif),
    custrecord_cryo_cesarea: toStringOrNull(raw.custrecord_cryo_cesarea),
    custrecord_cryo_duenio: toStringOrNull(raw.custrecord_cryo_duenio),
    custrecord_cryo_envio_exitoso: toStringOrNull(raw.custrecord_cryo_envio_exitoso),
    custrecord_cryo_especimen: toStringOrNull(raw.custrecord_cryo_especimen),
    custrecord_cryo_estatus: toStringOrNull(raw.custrecord_cryo_estatus),
    custrecord_cryo_fecha_ini_ultima_a: toStringOrNull(raw.custrecord_cryo_fecha_ini_ultima_a),
    custrecord_cryo_fechanacimiento: toStringOrNull(raw.custrecord_cryo_fechanacimiento),
    custrecord_cryo_fechaprocesamientoi: toStringOrNull(raw.custrecord_cryo_fechaprocesamientoi),
    custrecord_cryo_finicio: toStringOrNull(raw.custrecord_cryo_finicio),
    custrecord_cryo_fnacimientoconf: toStringOrNull(raw.custrecord_cryo_fnacimientoconf),
    custrecord_cryo_garantia_completa: toStringOrNull(raw.custrecord_cryo_garantia_completa),
    custrecord_cryo_garantiafallecimiento: toStringOrNull(raw.custrecord_cryo_garantiafallecimiento),
    custrecord_cryo_mensaje_email_mostrado: toStringOrNull(raw.custrecord_cryo_mensaje_email_mostrado),
    custrecord_cryo_mesnac_letra: toStringOrNull(raw.custrecord_cryo_mesnac_letra),
    custrecord_cryo_mesnacimiento: toStringOrNull(raw.custrecord_cryo_mesnacimiento),
    custrecord_cryo_moneda: toStringOrNull(raw.custrecord_cryo_moneda),
    custrecord_cryo_numerofamilia: toStringOrNull(raw.custrecord_cryo_numerofamilia),
    custrecord_cryo_padres: toStringOrNull(raw.custrecord_cryo_padres),
    custrecord_cryo_primera_vez_part: toStringOrNull(raw.custrecord_cryo_primera_vez_part),
    custrecord_cryo_procesadosi: toStringOrNull(raw.custrecord_cryo_procesadosi),
    custrecord_cryo_saldo_inicial: toStringOrNull(raw.custrecord_cryo_saldo_inicial),
    custrecord_cryo_servicio: toStringOrNull(raw.custrecord_cryo_servicio),
    custrecord_cryo_solicitaaprobacion: toStringOrNull(raw.custrecord_cryo_solicitaaprobacion),
    custrecord_cryo_subsidiariacontrato: toStringOrNull(raw.custrecord_cryo_subsidiariacontrato),
    custrecord_cryo_titular_deudor: toStringOrNull(raw.custrecord_cryo_titular_deudor),
    custrecord_cryo_titularcontrato: toStringOrNull(raw.custrecord_cryo_titularcontrato),
    custrecord_cryo_ubicacion: toStringOrNull(raw.custrecord_cryo_ubicacion),
    custrecord_cryo_vendedor: toStringOrNull(raw.custrecord_cryo_vendedor),
    custrecord_nso_cc_marca_contrato_mx: toStringOrNull(raw.custrecord_nso_cc_marca_contrato_mx),
    custrecordcryo_tipocambiocontrato: toStringOrNull(raw.custrecordcryo_tipocambiocontrato),
    isinactive: toStringOrNull(raw.isinactive),
    lastmodifiedby: toStringOrNull(raw.lastmodifiedby),
    owner: toStringOrNull(raw.owner),
    recordid: toStringOrNull(raw.recordid),
    scriptid: toStringOrNull(raw.scriptid),
    raw_data: JSON.stringify(raw),
  };
}
