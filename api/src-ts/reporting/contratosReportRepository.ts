import type { Knex } from 'knex';
import { applySubsidiaryRestriction, clampPage, clampPageSize, parseSubsidiaryFilter } from './reportingRepository';
import type { Paginated } from './types';

/**
 * "Reporte Contratos" - a wide, one-row-per-contract export mirroring a legacy reference
 * spreadsheet's exact column set, sourced ENTIRELY from NetSuite - same "no legacy Cryo.dbo
 * dependency" philosophy as Cuentas (cuentasRepository.ts), and reusing every field/subquery
 * pattern that file already confirmed live wherever the same concept applies (SCU/TCU per-type
 * costo/estado/pagado hasta, Teléfono 1-10, Referencia CIE NUEVA, Zona Franquicia/Asociado,
 * Estatus Cliente/Cobranza, Metal, Pago Automático).
 *
 * New fields confirmed for this report specifically (via NetSuite's own metadata-catalog schema
 * + live data, not guessed):
 * - Fecha de procesamiento = custrecord_cryo_fechaprocesamientoi - a genuine CONTRACT-level field
 *   (title "Fecha de procesamiento"), distinct from netsuite_services.custrecord_cryo_fecha_procesoserv
 *   used per-service-type in Cuentas' FP SCU/TCU/ADN.
 * - Médico = custrecord_cryo_ginecoloco (title blank in the schema, but live values are employee
 *   names like "MUNGO, CARLOS" - confirmed by sampling, not by label).
 * - Cobrador dueño = custrecord_cryo_duenio (same field/join Cuentas already uses for "Dueño" -
 *   confirmed live: values are literally "COBRADOR 1"/"POR DEFINIR", matching the reference
 *   export's sample rows exactly). custrecord_cryo_cobrador is a separate, unused field (empty on
 *   every contract sampled) - not the source.
 * - Zona = custrecord_cryo_mx_zonacobranza ("Zona Cobranza" - confirmed live via BUILTIN.DF:
 *   CDMX/GDL/PUE/TAB/MICH/CAM/BCU/BSCU, matching the sample rows' "CDMX" exactly) - a DIFFERENT
 *   field from Zona Franquicia/Asociado (used for both "Zona - Franquicia" and
 *   "Zona( FRANQUICIA/ASOCIADO)", which really are the same value duplicated under two headers in
 *   the reference export).
 * - Referencia SAP = custrecord_cryo_mx_referencia_sap - found in the same metadata scan; Cuentas
 *   still has this marked unavailable (pre-dates this discovery).
 * - Token = custrecord_nso_token, exposed raw here (unlike Cuentas' Link Pago, which wraps it in
 *   the renovaciones.cryo-cell.com.mx URL) - this report's column is literally "Token".
 *
 * Still unavailable (checked against the FULL confirmed customrecord1184 field list - no plausible
 * match exists, not merely unchecked): Fecha Venta, Costo DX (same unconfirmed servtipo-id gap as
 * Cuentas' pagado_hasta_dx/fp_dx), "Tipo", and the 10 fiscal/CFDI columns (RazonSocial..RegimenFiscal
 * - these live on the customer's address book, which isn't synced anywhere in this app; a real new
 * sync would be needed, not a quick backfill).
 */

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  '1': 'Activo', '7': 'Cancelado', '8': 'Suspendido', '11': 'Disposición', '13': 'Retirado del Tanque',
};

const SERVICE_STATUS_LABELS: Record<string, string> = {
  '1': 'Activo', '7': 'Cancelado', '8': 'Suspendido', '11': 'Disposición', '12': 'Seguridad total',
};

const FRANQUICIA_ASOCIADO_LABELS: Record<string, string> = {
  '1': 'JALISCO', '2': 'BCN-SONORA', '3': 'METROPOLI', '4': 'PUEBLA-TLAXCALA', '5': 'CENTRO',
  '6': 'BAJIO', '7': 'BAJA CALIFORNIA SUR-SINALOA', '8': 'NORTE', '9': 'NAYARIT', '10': 'TABASCO',
  '11': 'MICHOACAN', '12': 'COLIMA', '13': 'CAMPECHE', '15': 'CRYOCELL MATRIZ', '16': 'PUEBLA',
  '17': 'HERMOSILLO', '18': 'CDMX', '19': 'CUERNAVACA', '20': 'VERACRUZ', '21': 'LEON',
  '22': 'TIJUANA', '23': 'CANCUN', '24': 'QUERETARO', '25': 'MORELIA', '26': 'LA PAZ',
  '27': 'MONTERREY', '28': 'VILLAHERMOSA', '29': 'MERIDA', '30': 'PACHUCA', '31': 'CHIHUAHUA',
  '32': 'TOLUCA', '33': 'LOS MOCHIS', '34': 'TAMPICO', '35': 'CHIAPAS', '36': 'SAN LUIS POTOSI',
  '37': 'SALTILLO', '38': 'REYNOSA', '39': 'IRAPUATO', '40': 'GUADALAJARA', '41': 'MONCLOVA',
  '42': 'LOS CABOS', '43': 'LEON NUEVA', '44': 'ACAPULCO', '45': 'AGUASCALIENTES', '46': 'PUEBLA NUEVA',
  '47': 'FIBRO DF', '48': 'DURANGO', '116': 'CIUDAD DE MEXICO',
};

const MX_ESTATUS_CLIENTE_LABELS: Record<string, string> = {
  '1': 'CANCELADO', '2': 'FALTA DE INTERES', '3': 'GARANTIA', '4': 'ILOCALIZABLE',
  '5': 'NEGATIVA DE PAGO', '6': 'NO CONTESTA', '7': 'PROMESA', '8': 'RECUPERADO',
  '9': 'RECUPERADO / RETENCION', '10': 'RECUPERADO / RIESGO', '11': 'RETENCION', '12': 'SIN ESTATUS',
  '13': 'DATOS ACTUALIZADOS', '14': 'SIN CONTACTO',
};

const MX_ESTATUS_COBRANZA_LABELS: Record<string, string> = {
  '1': 'BLANCO', '2': 'CANCELADO I', '3': 'CANCELADO II', '4': 'ILOCALIZABLE I', '5': 'ILOCALIZABLE II',
  '6': 'GARANTIA BAJO VOLUMEN', '7': 'GARANTIA BAJO CONTEO', '8': 'GARANTIA X FALLECIMIENTO',
  '9': 'RECUPERADO', '10': 'RECUPERADO-BONIF MEDICO VENTAS', '11': 'RECUPERADO -BONIF COLABORADOR',
  '12': 'RECUPERADO- BONIF REFERIDOS', '13': 'RECUPERADO- DEPURADO', '14': 'RECUPERADO- PAGADO EN FRANQUICIA',
  '15': 'RECUPERADO-BONIF REEMBOLSO VENTAS', '16': 'RECUPERADO - BONIF DIR MEDICO',
  '17': 'RECUPERADO PARCIAL – FACTURA POR COBRAR', '18': 'RECUPERADO - PAQUETE', '19': 'PAGADO - RETENCION',
  '20': 'REACTIVACION S', '21': 'REACTIVACION C', '22': 'RECUPERADO-RIESGO CON TC BAJO',
  '23': 'RECUPERADO- RIESGO MONTO MINIMO', '24': 'PROMESA', '25': 'PROMESA PAGO PARCIALIDADES',
  '26': 'PROMESA - ESPERA DE EVIDENCIA DE PAGO', '27': 'NEGOCIACION', '28': 'FALTA DE LIQUIDEZ',
  '29': 'PROMESA CONDICIONADA', '30': 'MENSAJE CON TERCERO O FAMILIAR', '31': 'DESEMPLEO',
  '32': 'NO CONTESTA- VIA TELFONICA', '33': 'NO CONTESTA- VIA EMAIL', '34': 'NO CONTESTA- VIA TELEFONICA Y EMAIL',
  '35': 'NO CONTESTA - MAS DE 6 MESES', '36': 'NEGATIVA DE PAGO - VIA TELFONICA', '37': 'PROCESO DE RETENCION',
  '38': 'FALTA DE INTERES', '39': 'PROMESA CONDICIONADA', '40': 'RIESGO CON TC BAJO', '41': 'ACTUALIZADO',
  '42': 'NO ACTUALIZADO', '43': 'RECUPERADO - BONIF COLABORADOR',
};

const CLASIFICADOR_METAL_LABELS: Record<string, string> = {
  '1': 'ORO', '2': 'PLATA', '3': 'BRONCE', '4': 'SIN PROMOCION', '5': 'COBRE', '6': 'RIESGO',
  '7': 'BONIFICACION VITALICIA',
};

/** custrecord_cryo_mx_zonacobranza - confirmed live via BUILTIN.DF against production (the full
 * set actually in use, not guessed - same convention as every other label map in this file). */
const ZONA_COBRANZA_LABELS: Record<string, string> = {
  '1': 'CDMX', '2': 'GDL', '5': 'PUE', '6': 'TAB', '7': 'MICH', '8': 'CAM', '9': 'BCU', '10': 'BSCU',
};

// Same map csvExport.ts's SUBSIDIARY_LABELS uses (duplicated rather than shared, same convention
// as every other label map here) - resolved to a real label here, unlike Cuentas' subsidiaria_id
// (which stays a raw id, since Cuentas' CSV export's generic column-name-keyed lookup never
// actually matches its "subsidiaria_id" alias).
const SUBSIDIARY_LABELS: Record<string, string> = {
  '20': 'Biocordcell Argentina',
  '7': 'Células de Cordón Umbilical',
  '5': 'Cryo-Cell de México',
  '8': 'Operadora BSCU',
  '24': 'Instituto de Criopreservación y Terapia Celular',
  '25': 'Lazo de Vida',
};

function ynFromNetSuiteFlag(value: string | null): boolean | null {
  if (value === 'T') return true;
  if (value === 'F') return false;
  return null;
}

// Same NetSuite list netsuite_services.custrecord_cryo_tipodeserv uses - '1' Sangre/SCU,
// '2' Tejido/TCU, '3' ADN, '15' Placenta. No confirmed id represents "DX" yet (same gap as
// Cuentas' pagado_hasta_dx/fp_dx).
const SERVTIPO_SCU = '1';
const SERVTIPO_TCU = '2';
const SERVTIPO_ADN = '3';
const SERVTIPO_PLACENTA = '15';

export interface ContratoReportRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  fecha_alta: string | null;
  estado_contrato: string | null;
  titular_contrato: string | null;
  especimen: string | null;
  titular2: string | null;
  fecha_nacimiento: string | null;
  fecha_procesamiento: string | null;
  vendedor: string | null;
  cobrador_dueno: string | null;
  scu: boolean;
  estado_sangre: string | null;
  costo_anualidad_sangre: number | null;
  pagado_hasta_sangre: string | null;
  tcu: boolean;
  estado_tejido: string | null;
  costo_anualidad_tejido: number | null;
  pagado_hasta_tejido: string | null;
  medico: string | null;
  telefono_titular: string | null;
  correo_titular: string | null;
  zona: string | null;
  subsidiaria: string | null;
  costo_dx: null;
  costo_adn: number | null;
  costo_placenta: number | null;
  mes_nacimiento: number | null;
  telefono_1: string | null;
  telefono_2: string | null;
  telefono_3: string | null;
  telefono_4: string | null;
  telefono_5: string | null;
  telefono_6: string | null;
  telefono_7: string | null;
  telefono_8: string | null;
  telefono_9: string | null;
  telefono_10: string | null;
  correo_titular2: string | null;
  zona_franquicia: string | null;
  tipo: null;
  razon_social: null;
  rfc_fac: null;
  dir_fac: null;
  col_fac: null;
  cp_fac: null;
  pais_fac: null;
  estado_fac: null;
  ciudades_fac: null;
  usocfdi: null;
  regimen_fiscal: null;
  referencia_cie: string | null;
  referencia_sap: string | null;
  zona_franquicia_asociado: string | null;
  token: string | null;
  fecha_venta: null;
  estatus_cliente: string | null;
  estatus_cobranza: string | null;
  metal: string | null;
  pago_automatico: boolean | null;
}

/** Columns with no confirmed source anywhere in customrecord1184's full field list (checked, not
 * merely unchecked - see this file's header comment) - shown to the caller so the UI can render
 * one clear note instead of pretending these are just empty for this contract. */
export const UNAVAILABLE_COLUMNS: Array<{ key: keyof ContratoReportRow; label: string }> = [
  { key: 'costo_dx', label: 'Costo DX' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'razon_social', label: 'RazonSocial' },
  { key: 'rfc_fac', label: 'RFCFac' },
  { key: 'dir_fac', label: 'DirFac' },
  { key: 'col_fac', label: 'ColFac' },
  { key: 'cp_fac', label: 'CPFac' },
  { key: 'pais_fac', label: 'PaisFac' },
  { key: 'estado_fac', label: 'EstadoFac' },
  { key: 'ciudades_fac', label: 'CiudadesFac' },
  { key: 'usocfdi', label: 'usocfdi' },
  { key: 'regimen_fiscal', label: 'RegimenFiscal' },
  { key: 'fecha_venta', label: 'Fecha Venta' },
];

const TABLE = 'netsuite_contracts as C';
const SUBSIDIARY_COLUMN = 'C.custrecord_cryo_subsidiariacontrato';

interface RawContratoReportRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  fecha_alta: string | null;
  ns_estado_contrato: string | null;
  titular_contrato: string | null;
  especimen: string | null;
  titular2: string | null;
  fecha_nacimiento: string | null;
  fecha_procesamiento: string | null;
  vendedor: string | null;
  cobrador_dueno: string | null;
  scu: number | string | null;
  ns_estado_sangre: string | null;
  costo_anualidad_sangre: number | string | null;
  pagado_hasta_sangre: string | null;
  tcu: number | string | null;
  ns_estado_tejido: string | null;
  costo_anualidad_tejido: number | string | null;
  pagado_hasta_tejido: string | null;
  medico: string | null;
  telefono_titular: string | null;
  correo_titular: string | null;
  ns_zona: string | null;
  subsidiaria_id: string | null;
  costo_adn: number | string | null;
  costo_placenta: number | string | null;
  mes_nacimiento: number | null;
  telefono_1: string | null;
  telefono_2: string | null;
  telefono_3: string | null;
  telefono_4: string | null;
  telefono_5: string | null;
  telefono_6: string | null;
  telefono_7: string | null;
  telefono_8: string | null;
  telefono_9: string | null;
  telefono_10: string | null;
  correo_titular2: string | null;
  ns_zona_franquicia: string | null;
  ns_referencia_cie: string | null;
  ns_referencia_sap: string | null;
  ns_token: string | null;
  ns_estatus_cliente: string | null;
  ns_estatus_cobranza: string | null;
  ns_metal: string | null;
  ns_pago_automatico: string | null;
}

/** Whether an ACTIVE (isinactive = 'F') service of one type exists on the contract - "SI"/blank,
 * same active-only convention as Cuentas' costo_anualidad/tipo_servicio (a Cancelado-status
 * service still counts here, since "estatusservicio = Cancelado" is a business-status field,
 * separate from the record-level isinactive flag - confirmed live: this is exactly why the
 * reference export shows "SCU: SI" alongside "ESTADO SANGRE: Cancelado" in the same row). */
function serviceExistsSubquery(db: Knex, servtipo: string, alias: string): Knex.Raw {
  return db.raw(
    `(
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM netsuite_services S
        WHERE S.custrecord_cryo_idcontrato = C.netsuite_id AND S.custrecord_cryo_tipodeserv = ? AND S.isinactive = 'F'
      ) THEN 1 ELSE 0 END
    ) as ??`,
    [servtipo, alias],
  );
}

function serviceStatusSubquery(db: Knex, servtipo: string, alias: string): Knex.Raw {
  return db.raw(
    `(
      SELECT TOP 1 S.custrecord_cryo_estatusservicio
      FROM netsuite_services S
      WHERE S.custrecord_cryo_idcontrato = C.netsuite_id AND S.custrecord_cryo_tipodeserv = ? AND S.isinactive = 'F'
      ORDER BY S.lastmodifieddate_dt DESC
    ) as ??`,
    [servtipo, alias],
  );
}

function costoAnualidadSubquery(db: Knex, servtipo: string, alias: string): Knex.Raw {
  return db.raw(
    `(
      SELECT TOP 1 TRY_CONVERT(decimal(18,2), S.custrecord_cryo_precioanualtotal)
      FROM netsuite_services S
      WHERE S.custrecord_cryo_idcontrato = C.netsuite_id AND S.custrecord_cryo_tipodeserv = ? AND S.isinactive = 'F'
      ORDER BY S.lastmodifieddate_dt DESC
    ) as ??`,
    [servtipo, alias],
  );
}

function pagadoHastaSubquery(db: Knex, servtipo: string, alias: string): Knex.Raw {
  return db.raw(
    `(
      SELECT TOP 1 S.custrecord_cryo_pagadohasta
      FROM netsuite_services S
      WHERE S.custrecord_cryo_idcontrato = C.netsuite_id AND S.custrecord_cryo_tipodeserv = ? AND S.isinactive = 'F'
      ORDER BY S.lastmodifieddate_dt DESC
    ) as ??`,
    [servtipo, alias],
  );
}

/** Only the join(s) actually needed to filter/count rows - TITULAR only when `search` will
 * reference it, matching Cuentas' baseCuentasQuery/addOutputJoins split (the extra output-only
 * joins below cost real time on production's ~219k contracts, paid only for the current page). */
function baseContratosQuery(db: Knex, search: string): Knex.QueryBuilder {
  const qb = db(TABLE);

  if (search) {
    qb.leftJoin('netsuite_customers as TITULAR', 'TITULAR.netsuite_id', 'C.custrecord_cryo_titularcontrato');
    qb.where((builder) => {
      builder
        .orWhere('C.name', 'like', `%${search}%`)
        .orWhere('TITULAR.companyname', 'like', `%${search}%`)
        .orWhere('C.custrecord_cryo_contratosistemaanterior', 'like', `%${search}%`);
    });
  }

  return qb;
}

function addOutputJoins(qb: Knex.QueryBuilder, search: string): Knex.QueryBuilder {
  if (!search) {
    qb.leftJoin('netsuite_customers as TITULAR', 'TITULAR.netsuite_id', 'C.custrecord_cryo_titularcontrato');
  }
  qb.leftJoin('netsuite_family_members as PADRES', 'PADRES.netsuite_id', 'C.custrecord_cryo_padres');
  qb.leftJoin('netsuite_family_members as HIJO', 'HIJO.netsuite_id', 'C.custrecord_cryo_especimen');
  qb.leftJoin('netsuite_employees as VEND', 'VEND.netsuite_id', 'C.custrecord_cryo_vendedor');
  qb.leftJoin('netsuite_employees as DUENO', 'DUENO.netsuite_id', 'C.custrecord_cryo_duenio');
  qb.leftJoin('netsuite_employees as MEDICO', 'MEDICO.netsuite_id', 'C.custrecord_cryo_ginecoloco');
  return qb;
}

function selectContratoColumns(qb: Knex.QueryBuilder, db: Knex): Knex.QueryBuilder {
  return qb.select(
    'C.netsuite_id',
    'C.name as contrato',
    'C.custrecord_cryo_contratosistemaanterior as folio_sistema_anterior',
    'C.custrecord_cryo_finicio as fecha_alta',
    'C.custrecord_cryo_estatus as ns_estado_contrato',
    'TITULAR.companyname as titular_contrato',
    'HIJO.name as especimen',
    'PADRES.name as titular2',
    'C.custrecord_cryo_fnacimientoconf as fecha_nacimiento',
    'C.custrecord_cryo_fechaprocesamientoi as fecha_procesamiento',
    'VEND.entityid as vendedor',
    'DUENO.entityid as cobrador_dueno',
    'MEDICO.entityid as medico',
    'TITULAR.phone as telefono_titular',
    'TITULAR.email as correo_titular',
    'C.custrecord_cryo_mx_zonacobranza as ns_zona',
    'C.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
    db.raw(`MONTH(TRY_CONVERT(date, C.custrecord_cryo_fnacimientoconf, 103)) as mes_nacimiento`),
    'TITULAR.custentitycustentity_cryo_telefono1 as telefono_1',
    'TITULAR.custentitycustentity_cryo_telefono2 as telefono_2',
    'TITULAR.custentity_cryo_telefono3 as telefono_3',
    'TITULAR.custentity_cryo_telefono4 as telefono_4',
    'TITULAR.custentity3 as telefono_5',
    'TITULAR.custentity_cryo_telefono6 as telefono_6',
    'TITULAR.custentity_cryo_telefono7 as telefono_7',
    'TITULAR.custentity_cryo_telefono8 as telefono_8',
    'TITULAR.custentity_cryo_telefono9 as telefono_9',
    'TITULAR.custentity_cryo_telefono10 as telefono_10',
    'PADRES.custrecord_cryo_main_email as correo_titular2',
    'C.custrecord_cryo_mx_franquiciaasociado as ns_zona_franquicia',
    'C.custrecord_nso_nrp_num_ferencia_unico as ns_referencia_cie',
    'C.custrecord_cryo_mx_referencia_sap as ns_referencia_sap',
    'C.custrecord_nso_token as ns_token',
    'C.custrecord_cryo_mx_estatus_cliente as ns_estatus_cliente',
    'C.custrecord_cryo_mx_estatus_cobranza as ns_estatus_cobranza',
    'C.custrecord_cryo_mx_clasificadormetal as ns_metal',
    'C.custrecord_cryo_mx_pagoautomatico as ns_pago_automatico',
    serviceExistsSubquery(db, SERVTIPO_SCU, 'scu'),
    serviceStatusSubquery(db, SERVTIPO_SCU, 'ns_estado_sangre'),
    costoAnualidadSubquery(db, SERVTIPO_SCU, 'costo_anualidad_sangre'),
    pagadoHastaSubquery(db, SERVTIPO_SCU, 'pagado_hasta_sangre'),
    serviceExistsSubquery(db, SERVTIPO_TCU, 'tcu'),
    serviceStatusSubquery(db, SERVTIPO_TCU, 'ns_estado_tejido'),
    costoAnualidadSubquery(db, SERVTIPO_TCU, 'costo_anualidad_tejido'),
    pagadoHastaSubquery(db, SERVTIPO_TCU, 'pagado_hasta_tejido'),
    costoAnualidadSubquery(db, SERVTIPO_ADN, 'costo_adn'),
    costoAnualidadSubquery(db, SERVTIPO_PLACENTA, 'costo_placenta'),
  );
}

function buildContratoRow(raw: RawContratoReportRow): ContratoReportRow {
  return {
    netsuite_id: raw.netsuite_id,
    contrato: raw.contrato,
    folio_sistema_anterior: raw.folio_sistema_anterior,
    fecha_alta: raw.fecha_alta,
    estado_contrato: (raw.ns_estado_contrato && CONTRACT_STATUS_LABELS[raw.ns_estado_contrato]) || null,
    titular_contrato: raw.titular_contrato,
    especimen: raw.especimen,
    titular2: raw.titular2,
    fecha_nacimiento: raw.fecha_nacimiento,
    fecha_procesamiento: raw.fecha_procesamiento,
    vendedor: raw.vendedor,
    cobrador_dueno: raw.cobrador_dueno,
    scu: Boolean(Number(raw.scu)),
    estado_sangre: (raw.ns_estado_sangre && SERVICE_STATUS_LABELS[raw.ns_estado_sangre]) || null,
    costo_anualidad_sangre: raw.costo_anualidad_sangre !== null ? Number(raw.costo_anualidad_sangre) : null,
    pagado_hasta_sangre: raw.pagado_hasta_sangre,
    tcu: Boolean(Number(raw.tcu)),
    estado_tejido: (raw.ns_estado_tejido && SERVICE_STATUS_LABELS[raw.ns_estado_tejido]) || null,
    costo_anualidad_tejido: raw.costo_anualidad_tejido !== null ? Number(raw.costo_anualidad_tejido) : null,
    pagado_hasta_tejido: raw.pagado_hasta_tejido,
    medico: raw.medico,
    telefono_titular: raw.telefono_titular,
    correo_titular: raw.correo_titular,
    zona: (raw.ns_zona && ZONA_COBRANZA_LABELS[raw.ns_zona]) || null,
    subsidiaria: (raw.subsidiaria_id && SUBSIDIARY_LABELS[raw.subsidiaria_id]) || null,
    costo_dx: null,
    costo_adn: raw.costo_adn !== null ? Number(raw.costo_adn) : null,
    costo_placenta: raw.costo_placenta !== null ? Number(raw.costo_placenta) : null,
    mes_nacimiento: raw.mes_nacimiento,
    telefono_1: raw.telefono_1,
    telefono_2: raw.telefono_2,
    telefono_3: raw.telefono_3,
    telefono_4: raw.telefono_4,
    telefono_5: raw.telefono_5,
    telefono_6: raw.telefono_6,
    telefono_7: raw.telefono_7,
    telefono_8: raw.telefono_8,
    telefono_9: raw.telefono_9,
    telefono_10: raw.telefono_10,
    correo_titular2: raw.correo_titular2,
    zona_franquicia: (raw.ns_zona_franquicia && FRANQUICIA_ASOCIADO_LABELS[raw.ns_zona_franquicia]) || null,
    tipo: null,
    razon_social: null,
    rfc_fac: null,
    dir_fac: null,
    col_fac: null,
    cp_fac: null,
    pais_fac: null,
    estado_fac: null,
    ciudades_fac: null,
    usocfdi: null,
    regimen_fiscal: null,
    referencia_cie: raw.ns_referencia_cie,
    referencia_sap: raw.ns_referencia_sap,
    zona_franquicia_asociado: (raw.ns_zona_franquicia && FRANQUICIA_ASOCIADO_LABELS[raw.ns_zona_franquicia]) || null,
    token: raw.ns_token,
    fecha_venta: null,
    estatus_cliente: (raw.ns_estatus_cliente && MX_ESTATUS_CLIENTE_LABELS[raw.ns_estatus_cliente]) || null,
    estatus_cobranza: (raw.ns_estatus_cobranza && MX_ESTATUS_COBRANZA_LABELS[raw.ns_estatus_cobranza]) || null,
    metal: (raw.ns_metal && CLASIFICADOR_METAL_LABELS[raw.ns_metal]) || null,
    pago_automatico: ynFromNetSuiteFlag(raw.ns_pago_automatico),
  };
}

export interface ContratosReportParams {
  page: unknown;
  pageSize: unknown;
  search: unknown;
  subsidiary: unknown;
}

export async function getContratosReportPaged(
  db: Knex,
  params: ContratosReportParams,
  restrictSubsidiaries: Set<string> | null,
): Promise<Paginated<ContratoReportRow>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const requestedSubsidiaries = parseSubsidiaryFilter(params.subsidiary);

  const qb = baseContratosQuery(db, search);
  if (restrictSubsidiaries !== null) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  if (requestedSubsidiaries.size > 0) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, requestedSubsidiaries);

  const countQb = qb.clone().clearSelect().count('* as count').first();
  const rowsQb = selectContratoColumns(addOutputJoins(qb, search), db)
    .orderBy('C.lastmodifieddate_dt', 'desc')
    .offset((page - 1) * pageSize)
    .limit(pageSize);

  const [rawRows, countRow] = await Promise.all([rowsQb as Promise<RawContratoReportRow[]>, countQb as Promise<{ count: number } | undefined>]);
  const total = Number(countRow?.count ?? 0);

  return { data: rawRows.map(buildContratoRow), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Unpaginated - the whole filtered set, for CSV export (same convention as Cuentas' getCuentasForExport). */
export async function getContratosReportForExport(
  db: Knex,
  params: Pick<ContratosReportParams, 'search' | 'subsidiary'>,
  restrictSubsidiaries: Set<string> | null,
): Promise<ContratoReportRow[]> {
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const requestedSubsidiaries = parseSubsidiaryFilter(params.subsidiary);

  const qb = baseContratosQuery(db, search);
  if (restrictSubsidiaries !== null) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  if (requestedSubsidiaries.size > 0) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, requestedSubsidiaries);

  const rawRows = (await selectContratoColumns(addOutputJoins(qb, search), db).orderBy('C.lastmodifieddate_dt', 'desc')) as RawContratoReportRow[];
  return rawRows.map(buildContratoRow);
}
