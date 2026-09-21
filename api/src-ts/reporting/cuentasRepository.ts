import type { Knex } from 'knex';
import { applySubsidiaryRestriction, clampPage, clampPageSize, parseSubsidiaryFilter } from './reportingRepository';
import type { Paginated } from './types';

/**
 * "Cuentas" - a per-contract account/collections detail sheet the sales/collections team already
 * keeps by hand, sourced ENTIRELY from NetSuite - no legacy Cryo.dbo/CryoCell database dependency
 * at all, by design. This deliberately trades some coverage (a handful of fields Cryo.dbo did
 * have, but NetSuite doesn't yet - see UNAVAILABLE_COLUMNS) for a report whose data provenance is
 * 100% verifiable against the live NetSuite account, with nothing silently blended in from a
 * second, harder-to-audit system:
 *
 * 1. netsuite_contracts' plain fields (titular/second-titular/child/dueño via joins, a
 *    services-costoanualidad rollup, netsuite_partidas for Adeudo/Pagado Hasta - see below).
 * 2. netsuite_contracts' "Clasificadores" fields (Zona Franquicia/Asociado, Estatus Cliente,
 *    Estatus Cobranza, Metal, No Molestar, Pago Automático, Referencia CIE) - these live on the
 *    SAME customrecord1184 record as everything else here, just under a different UI tab, not a
 *    different custom type (confirmed live via SuiteQL/BUILTIN.DF - see the *_LABELS maps below,
 *    each the full confirmed id->label set for its list). Only populated for contracts that have
 *    gone through Mexico-specific collections workflow (~76% of production contracts as of this
 *    writing) - null otherwise, a real "not classified in NetSuite yet" gap, not a bug.
 *
 * Adeudo total = the sum of every "Vencido" (custrecord_cryo_estatuspartida = '4') partida on the
 * contract whose own date has already passed - confirmed by the user over an earlier guess of
 * pulling this from Cryo.dbo.Contrato.TotalAdeudo, which was wrong (partidas are the real source
 * for both this app and the legacy system - Cryo.dbo's own TotalAdeudo was a stale/derived copy).
 * Pagado Hasta SCU/TCU/ADN = the date of that service's most recently PAID
 * (custrecord_cryo_estatuspartida = '1') partida, via custrecord_cryo_servtipo (confirmed in
 * labels.ts to reference the same NetSuite list as netsuite_services.custrecord_cryo_tipodeserv -
 * '1' Sangre/SCU, '2' Tejido/TCU, '3' ADN). "DX" has no confirmed servtipo id yet, so
 * pagado_hasta_dx (and fp_dx) stay unavailable - see UNAVAILABLE_COLUMNS.
 *
 * Everything Cryo.dbo used to fill in here (Numero de años, TokenSAT, and the phone-number
 * breakdown by type - Cryo.dbo.Contrato.Anos/Titular.TokenSAT/TitularTelefono, none confirmed to
 * have a NetSuite equivalent: custrecord_cryo_aniosanticipados is a different, always-'0' field,
 * and custrecord_nso_token isn't a SAT token - it's populated even on Argentina contracts, where
 * SAT/CFDI doesn't apply) is now in UNAVAILABLE_COLUMNS instead, same as every other column with
 * no confirmed NetSuite source. Confirm the real NetSuite field for any of these (there may be
 * one this session's schema search simply didn't find) and they can move out of that list.
 */

// Every one of these is the FULL confirmed set of values actually in use, resolved via
// `SELECT DISTINCT <field>, BUILTIN.DF(<field>) FROM customrecord1184` against the live
// production account (same convention as web/src/config/labels.ts) - not guessed.
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

function ynFromNetSuiteFlag(value: string | null): boolean | null {
  if (value === 'T') return true;
  if (value === 'F') return false;
  return null;
}

export interface CuentaRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  titular_telefono: string | null;
  /** custrecord_cryo_fnacimientoconf - raw "DD/MM/YYYY" text, same shape as every other NetSuite locale date field this app already parses (see utils/format.ts's toDate on the frontend). */
  fecha_nacimiento_confirmada: string | null;
  mes_nacimiento: number | null;
  titular2_nombre: string | null;
  titular2_email: string | null;
  titular2_telefono: null;
  numero_anos: null;
  adeudo_total: number | null;
  interes: null;
  costo_anualidad: number | null;
  nombre_hijo: string | null;
  referencia_cie: string | null;
  referencia_sap: null;
  zona: string | null;
  fp_scu: null;
  fp_tcu: null;
  fp_dx: null;
  fp_adn: null;
  pagado_hasta_scu: string | null;
  pagado_hasta_tcu: string | null;
  pagado_hasta_dx: null;
  pagado_hasta_adn: string | null;
  pago_automatico: boolean | null;
  estatus_cliente: string | null;
  estatus_cobranza: string | null;
  metal: string | null;
  tel_casa1: null;
  tel_casa2: null;
  cel_mama: null;
  cel_papa: null;
  tel_oficina_madre: null;
  tel_oficina_padre: null;
  tel_pariente1: null;
  tel_pariente2: null;
  super_promo: null;
  link_pago: null;
  token_sat: null;
  dueno: string | null;
  no_molestar: boolean | null;
}

/** Columns from the reference export with no confirmed source in NetSuite or Cryo.dbo, after
 * checking netsuite_contracts/netsuite_services' full column lists and every Cryo.dbo table whose
 * name plausibly matched (Interes/Anualidad/SAP/CIE/SuperPromo/Pago tables). Shown to the caller
 * so the UI can render one clear note instead of pretending these are just empty for this
 * contract. */
export const UNAVAILABLE_COLUMNS: Array<{ key: keyof CuentaRow; label: string }> = [
  { key: 'titular2_telefono', label: 'Teléfono celular (Titular 2)' },
  { key: 'numero_anos', label: 'Numero de años' },
  { key: 'interes', label: 'Interés' },
  { key: 'referencia_sap', label: 'Referencia SAP' },
  { key: 'fp_scu', label: 'FP SCU' },
  { key: 'fp_tcu', label: 'FP TCU' },
  { key: 'fp_dx', label: 'FP DX' },
  { key: 'fp_adn', label: 'FP ADN' },
  { key: 'tel_casa1', label: 'Tel Casa 1' },
  { key: 'tel_casa2', label: 'Tel Casa 2' },
  { key: 'cel_mama', label: 'Cel Mamá' },
  { key: 'cel_papa', label: 'Cel Papá' },
  { key: 'tel_oficina_madre', label: 'Tel Oficina Madre' },
  { key: 'tel_oficina_padre', label: 'Tel Oficina Padre' },
  { key: 'tel_pariente1', label: 'Tel Pariente 1' },
  { key: 'tel_pariente2', label: 'Tel Pariente 2' },
  { key: 'super_promo', label: 'SuperPromo' },
  { key: 'link_pago', label: 'Link Pago' },
  { key: 'token_sat', label: 'TokenSAT' },
  { key: 'pagado_hasta_dx', label: 'Pagado Hasta DX' },
];

const TABLE = 'netsuite_contracts as C';
const SUBSIDIARY_COLUMN = 'C.custrecord_cryo_subsidiariacontrato';

interface RawCuentaRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  titular_telefono: string | null;
  fecha_nacimiento_confirmada: string | null;
  mes_nacimiento: number | null;
  titular2_nombre: string | null;
  titular2_email: string | null;
  dueno: string | null;
  nombre_hijo: string | null;
  costo_anualidad: number | string | null;
  adeudo_total: number | string | null;
  ns_franquicia_asociado: string | null;
  ns_estatus_cliente: string | null;
  ns_estatus_cobranza: string | null;
  ns_metal: string | null;
  ns_no_molestar: string | null;
  ns_pago_automatico: string | null;
  ns_cie: string | null;
  pagado_hasta_scu: string | null;
  pagado_hasta_tcu: string | null;
  pagado_hasta_adn: string | null;
}

// Same NetSuite list netsuite_services.custrecord_cryo_tipodeserv uses (confirmed in labels.ts) -
// '1' Sangre/SCU, '2' Tejido/TCU, '3' ADN. No confirmed id represents "DX" yet.
const SERVTIPO_SCU = '1';
const SERVTIPO_TCU = '2';
const SERVTIPO_ADN = '3';
// custrecord_cryo_estatuspartida (see labels.ts's PARTIDA_STATUS_LABELS).
const PARTIDA_ESTATUS_PAGADO = '1';
const PARTIDA_ESTATUS_VENCIDO = '4';

/** Most recent PAID partida's own date, for one service type on this contract - "Pagado Hasta". */
function pagadoHastaSubquery(db: Knex, servtipo: string, alias: string): Knex.Raw {
  return db.raw(
    `(
      SELECT TOP 1 P.custrecord_cryo_fechapartida
      FROM netsuite_partidas P
      WHERE P.custrecord_cryo_numcontrato = C.netsuite_id
        AND P.custrecord_cryo_servtipo = ?
        AND P.custrecord_cryo_estatuspartida = ?
        AND P.isinactive = 'F'
      ORDER BY TRY_CONVERT(date, P.custrecord_cryo_fechapartida, 103) DESC
    ) as ??`,
    [servtipo, PARTIDA_ESTATUS_PAGADO, alias],
  );
}

/**
 * Only the join(s) actually needed to filter/count rows - TITULAR only when `search` will
 * reference it, nothing else. Used as-is for the COUNT query: joining netsuite_family_members/
 * netsuite_employees there too (as an earlier version of this file did) cost well over a second
 * on production's ~219k contracts for zero benefit, since neither is ever referenced by a WHERE
 * clause - only addOutputJoins' extra joins (needed for the actual SELECT list) pay that cost,
 * and only for the current page's 25-100 rows.
 */
function baseCuentasQuery(db: Knex, search: string): Knex.QueryBuilder {
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

/** Adds the joins the SELECT list (not the WHERE clause) needs - called only on the branch that
 * actually fetches rows, after the COUNT query has already been cloned off without them. */
function addOutputJoins(qb: Knex.QueryBuilder, search: string): Knex.QueryBuilder {
  if (!search) {
    qb.leftJoin('netsuite_customers as TITULAR', 'TITULAR.netsuite_id', 'C.custrecord_cryo_titularcontrato');
  }
  qb.leftJoin('netsuite_family_members as TITULAR2', 'TITULAR2.netsuite_id', 'C.custrecord_cryo_padres');
  qb.leftJoin('netsuite_employees as DUENO', 'DUENO.netsuite_id', 'C.custrecord_cryo_duenio');
  return qb;
}

function selectCuentaColumns(qb: Knex.QueryBuilder, db: Knex): Knex.QueryBuilder {
  return qb.select(
    'C.netsuite_id',
    'C.name as contrato',
    'C.custrecord_cryo_contratosistemaanterior as folio_sistema_anterior',
    'C.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
    'TITULAR.companyname as titular_nombre',
    'TITULAR.email as titular_email',
    'TITULAR.phone as titular_telefono',
    'C.custrecord_cryo_fnacimientoconf as fecha_nacimiento_confirmada',
    db.raw(`MONTH(TRY_CONVERT(date, C.custrecord_cryo_fnacimientoconf, 103)) as mes_nacimiento`),
    'TITULAR2.custrecord_cryo_nombremiembro as titular2_nombre',
    'TITULAR2.custrecord_cryo_main_email as titular2_email',
    'DUENO.entityid as dueno',
    'C.custrecord_cryo_mx_franquiciaasociado as ns_franquicia_asociado',
    'C.custrecord_cryo_mx_estatus_cliente as ns_estatus_cliente',
    'C.custrecord_cryo_mx_estatus_cobranza as ns_estatus_cobranza',
    'C.custrecord_cryo_mx_clasificadormetal as ns_metal',
    'C.custrecord_cryo_mx_nomolestar as ns_no_molestar',
    'C.custrecord_cryo_mx_pagoautomatico as ns_pago_automatico',
    'C.custrecord_cryo_mx_cie as ns_cie',
    db.raw(`(
      SELECT TOP 1 FM.custrecord_cryo_nombremiembro
      FROM netsuite_family_members FM
      WHERE FM.custrecord_cryo_idfamilia = C.custrecord_cryo_numerofamilia
        AND FM.custrecord_cryo_parentesco = '1'
      ORDER BY FM.netsuite_id
    ) as nombre_hijo`),
    db.raw(`(
      SELECT SUM(TRY_CONVERT(decimal(18,2), S.custrecord_cryo_costoanualidad))
      FROM netsuite_services S
      WHERE S.custrecord_cryo_idcontrato = C.netsuite_id AND S.isinactive = 'F'
    ) as costo_anualidad`),
    db.raw(
      `(
        SELECT SUM(TRY_CONVERT(decimal(18,2), P.custrecord_cryo_importepartida))
        FROM netsuite_partidas P
        WHERE P.custrecord_cryo_numcontrato = C.netsuite_id
          AND P.custrecord_cryo_estatuspartida = ?
          AND P.isinactive = 'F'
          AND TRY_CONVERT(date, P.custrecord_cryo_fechapartida, 103) < CAST(GETDATE() AS date)
      ) as adeudo_total`,
      [PARTIDA_ESTATUS_VENCIDO],
    ),
    pagadoHastaSubquery(db, SERVTIPO_SCU, 'pagado_hasta_scu'),
    pagadoHastaSubquery(db, SERVTIPO_TCU, 'pagado_hasta_tcu'),
    pagadoHastaSubquery(db, SERVTIPO_ADN, 'pagado_hasta_adn'),
  );
}

function buildCuentaRow(raw: RawCuentaRow): CuentaRow {
  return {
    netsuite_id: raw.netsuite_id,
    contrato: raw.contrato,
    folio_sistema_anterior: raw.folio_sistema_anterior,
    subsidiaria_id: raw.subsidiaria_id,
    titular_nombre: raw.titular_nombre,
    titular_email: raw.titular_email,
    titular_telefono: raw.titular_telefono,
    fecha_nacimiento_confirmada: raw.fecha_nacimiento_confirmada,
    mes_nacimiento: raw.mes_nacimiento,
    titular2_nombre: raw.titular2_nombre,
    titular2_email: raw.titular2_email,
    titular2_telefono: null,
    numero_anos: null,
    adeudo_total: raw.adeudo_total !== null ? Number(raw.adeudo_total) : null,
    interes: null,
    costo_anualidad: raw.costo_anualidad !== null ? Number(raw.costo_anualidad) : null,
    nombre_hijo: raw.nombre_hijo,
    referencia_cie: raw.ns_cie,
    referencia_sap: null,
    zona: (raw.ns_franquicia_asociado && FRANQUICIA_ASOCIADO_LABELS[raw.ns_franquicia_asociado]) || null,
    fp_scu: null,
    fp_tcu: null,
    fp_dx: null,
    fp_adn: null,
    pago_automatico: ynFromNetSuiteFlag(raw.ns_pago_automatico),
    estatus_cliente: (raw.ns_estatus_cliente && MX_ESTATUS_CLIENTE_LABELS[raw.ns_estatus_cliente]) || null,
    estatus_cobranza: (raw.ns_estatus_cobranza && MX_ESTATUS_COBRANZA_LABELS[raw.ns_estatus_cobranza]) || null,
    metal: (raw.ns_metal && CLASIFICADOR_METAL_LABELS[raw.ns_metal]) || null,
    tel_casa1: null,
    tel_casa2: null,
    cel_mama: null,
    cel_papa: null,
    tel_oficina_madre: null,
    tel_oficina_padre: null,
    tel_pariente1: null,
    tel_pariente2: null,
    super_promo: null,
    link_pago: null,
    token_sat: null,
    pagado_hasta_scu: raw.pagado_hasta_scu,
    pagado_hasta_tcu: raw.pagado_hasta_tcu,
    pagado_hasta_dx: null,
    pagado_hasta_adn: raw.pagado_hasta_adn,
    dueno: raw.dueno,
    no_molestar: ynFromNetSuiteFlag(raw.ns_no_molestar),
  };
}

export interface CuentasParams {
  page: unknown;
  pageSize: unknown;
  search: unknown;
  subsidiary: unknown;
}

export async function getCuentasPaged(
  db: Knex,
  params: CuentasParams,
  restrictSubsidiaries: Set<string> | null,
): Promise<Paginated<CuentaRow>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const requestedSubsidiaries = parseSubsidiaryFilter(params.subsidiary);

  const qb = baseCuentasQuery(db, search);
  if (restrictSubsidiaries !== null) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  if (requestedSubsidiaries.size > 0) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, requestedSubsidiaries);

  const countQb = qb.clone().clearSelect().count('* as count').first();
  const rowsQb = selectCuentaColumns(addOutputJoins(qb, search), db)
    .orderBy('C.lastmodifieddate_dt', 'desc')
    .offset((page - 1) * pageSize)
    .limit(pageSize);

  const [rawRows, countRow] = await Promise.all([rowsQb as Promise<RawCuentaRow[]>, countQb as Promise<{ count: number } | undefined>]);
  const total = Number(countRow?.count ?? 0);

  return { data: rawRows.map(buildCuentaRow), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Unpaginated - the whole filtered set, for CSV export (same convention as every other entity's exportEntityRows). */
export async function getCuentasForExport(
  db: Knex,
  params: Pick<CuentasParams, 'search' | 'subsidiary'>,
  restrictSubsidiaries: Set<string> | null,
): Promise<CuentaRow[]> {
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const requestedSubsidiaries = parseSubsidiaryFilter(params.subsidiary);

  const qb = baseCuentasQuery(db, search);
  if (restrictSubsidiaries !== null) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  if (requestedSubsidiaries.size > 0) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, requestedSubsidiaries);

  const rawRows = (await selectCuentaColumns(addOutputJoins(qb, search), db).orderBy('C.lastmodifieddate_dt', 'desc')) as RawCuentaRow[];
  return rawRows.map(buildCuentaRow);
}
