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
 *    Estatus Cobranza, Metal, No Molestar, Pago Automático) - these live on the SAME
 *    customrecord1184 record as everything else here, just under a different UI tab, not a
 *    different custom type (confirmed live via SuiteQL/BUILTIN.DF - see the *_LABELS maps below,
 *    each the full confirmed id->label set for its list). Only populated for contracts that have
 *    gone through Mexico-specific collections workflow (~76% of production contracts as of this
 *    writing) - null otherwise, a real "not classified in NetSuite yet" gap, not a bug.
 *
 * Referencia CIE NUEVA = netsuite_contracts.custrecord_nso_nrp_num_ferencia_unico (confirmed by
 * the user) - a plain field on customrecord1184, NOT part of the Clasificadores tab above and NOT
 * custrecord_cryo_mx_cie (a different, unrelated field this column used to read from).
 *
 * Numero de años (confirmed by the user) = count of DISTINCT years among this contract's
 * PENDIENTE (custrecord_cryo_estatuspartida = '3') partidas, only counting years already at or
 * before the current calendar year - a Pendiente partida dated for a future year isn't "behind"
 * yet. Distinct from Adeudo total below, which is specifically about Vencido partidas.
 *
 * Adeudo total = the sum of every "Vencido" (custrecord_cryo_estatuspartida = '4') partida on the
 * contract whose own date has already passed - confirmed by the user over an earlier guess of
 * pulling this from Cryo.dbo.Contrato.TotalAdeudo, which was wrong (partidas are the real source
 * for both this app and the legacy system - Cryo.dbo's own TotalAdeudo was a stale/derived copy).
 * Interés = the sum of custrecord_cryo_interes across EVERY active partida on the contract, no
 * estatus/date filter (confirmed live: unlike Adeudo, this field is populated across every
 * partida status - Vencido, Pagado, Parcialmente pagado, Pendiente alike - so restricting it to
 * Vencido like Adeudo would silently drop the ~95% of interest recorded on already-paid lines).
 * Costo de anualidad = the sum, across the contract's active (isinactive = 'F') netsuite_services
 * rows, of custrecord_cryo_precioanualtotal ("Costo Anualidad C/Imp" in the NetSuite UI) -
 * confirmed by the user against a real contract (MX-CC-2026-115451-1) where the previously-used
 * custrecord_cryo_costoanualidad ("Costo Anualidad INICIAL" - a one-time first-year price) and
 * custrecord_cryo_costo_anual_auto ("Costo Anualidad" - a different, smaller auto-calculated
 * figure) were both populated but neither summed to the expected total.
 * Tipo de Servicio = one letter per distinct ACTIVE (isinactive = 'F') service on the contract -
 * Sangre=S, Tejido=T, Diente=D, Placenta=P, Adn=A - joined with "+" in that fixed order, e.g.
 * "S+T" for a contract with an active Sangre and an active Tejido service (cancelled/inactive
 * services don't count, same convention as Costo de anualidad above).
 * Pagado Hasta SCU/TCU/ADN = the contract's active netsuite_services row's own
 * custrecord_cryo_pagadohasta, per custrecord_cryo_tipodeserv ('1' Sangre/SCU, '2' Tejido/TCU, '3'
 * ADN - confirmed in labels.ts to be the same NetSuite list custrecord_cryo_servtipo on partidas
 * uses) - a bare paid-through YEAR (e.g. "2027"), not a full date, confirmed by the user. This
 * replaced an earlier derived calculation (most recent PAID partida's own date) that was kept as
 * a placeholder until this real field was found - it was never on netsuite_partidas as first
 * guessed. "DX" has no confirmed servtipo id yet, so pagado_hasta_dx (and fp_dx) stay unavailable
 * - see UNAVAILABLE_COLUMNS.
 * FP SCU/TCU/ADN ("Fecha Procesamiento", confirmed by the user) = same shape as Pagado Hasta
 * above, but from custrecord_cryo_fecha_procesoserv - a real Date field on the Servicio record
 * (confirmed live in NetSuite's own field list, type "Date") that only ever synced empty because
 * the integration role lacked field-level access to it; fixed live in NetSuite, then backfilled
 * for all already-synced rows (they predate the fix, so raw_data never had it - unlike every
 * other field added to this report, this one needed a real NetSuite re-fetch, not a JSON_VALUE
 * extraction from already-synced raw_data). Same "DX" gap as Pagado Hasta.
 *
 * Link Pago = `https://renovaciones.cryo-cell.com.mx/dashboard/{token}`, token =
 * custrecord_nso_token (confirmed by the user - NOT a SAT stamp token despite the "TokenSAT"-like
 * naming coincidence with the legacy field this session originally guessed it might be).
 *
 * Teléfono celular (Titular 2) = netsuite_family_members.custrecord_cryo_telefonocelular, on the
 * SAME family_members row already joined for titular2_nombre/titular2_email (confirmed by the
 * user that this specific phone belongs on family_members, not Cryo.dbo).
 *
 * Teléfono 1-10 = the titular's (netsuite_customers, joined as TITULAR) own numbered "Teléfono N"
 * custom entity fields (confirmed by the user) - these replaced the old guessed Cryo.dbo-style
 * Tel Casa 1/2, Cel Mamá/Papá, Tel Oficina Madre/Padre, Tel Pariente 1/2 columns, which never had
 * a confirmed NetSuite source and sat in UNAVAILABLE_COLUMNS for the whole rest of this file's
 * history - the user instead wants the plain numbered NetSuite fields with no attempt at
 * semantic relabeling. Field ids are irregular (confirmed live via NetSuite's own metadata-
 * catalog schema, NOT by naming convention): Teléfono 1/2 carry a doubled
 * "custentitycustentity_" prefix from how they were originally created, and Teléfono 5 is
 * `custentity3` - an auto-numbered id that doesn't follow the custentity_cryo_telefonoN pattern
 * at all. No telefono5-named field exists; custentity3 IS "Teléfono 5" as its own field label.
 *
 * Referencia SAP, SuperPromo and TokenSAT (Cryo.dbo.Titular.TokenSAT) never had a confirmed
 * NetSuite source when this report was built and sat in UNAVAILABLE_COLUMNS as permanent-null
 * placeholders; removed from the report entirely at the user's request rather than kept as blank
 * columns. Note: custrecord_cryo_mx_referencia_sap ("Referencia SAP") was later confirmed live and
 * backfilled onto netsuite_contracts for Reporte Contratos - if Cuentas should show it after all,
 * it can be wired back in as a real column instead of staying removed.
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

const LINK_PAGO_BASE_URL = 'https://renovaciones.cryo-cell.com.mx/dashboard/';

function buildLinkPago(token: string | null): string | null {
  return token ? `${LINK_PAGO_BASE_URL}${token}` : null;
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
  titular2_telefono: string | null;
  numero_anos: number | null;
  adeudo_total: number | null;
  interes: number | null;
  costo_anualidad: number | null;
  tipo_servicio: string | null;
  nombre_hijo: string | null;
  referencia_cie: string | null;
  zona: string | null;
  fp_scu: string | null;
  fp_tcu: string | null;
  fp_dx: null;
  fp_adn: string | null;
  pagado_hasta_scu: string | null;
  pagado_hasta_tcu: string | null;
  pagado_hasta_dx: null;
  pagado_hasta_adn: string | null;
  pago_automatico: boolean | null;
  estatus_cliente: string | null;
  estatus_cobranza: string | null;
  metal: string | null;
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
  link_pago: string | null;
  dueno: string | null;
  no_molestar: boolean | null;
}

/** Columns from the reference export with no confirmed source in NetSuite or Cryo.dbo, after
 * checking netsuite_contracts/netsuite_services' full column lists and every Cryo.dbo table whose
 * name plausibly matched (Interes/Anualidad/SAP/CIE/SuperPromo/Pago tables). Shown to the caller
 * so the UI can render one clear note instead of pretending these are just empty for this
 * contract. */
export const UNAVAILABLE_COLUMNS: Array<{ key: keyof CuentaRow; label: string }> = [
  { key: 'fp_dx', label: 'FP DX' },
  { key: 'pagado_hasta_dx', label: 'Pagado Hasta DX' },
];

const TABLE = 'netsuite_contracts as C';
const SUBSIDIARY_COLUMN = 'C.custrecord_cryo_subsidiariacontrato';

export interface RawCuentaRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  titular_telefono: string | null;
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
  fecha_nacimiento_confirmada: string | null;
  mes_nacimiento: number | null;
  titular2_nombre: string | null;
  titular2_email: string | null;
  titular2_telefono: string | null;
  dueno: string | null;
  nombre_hijo: string | null;
  tipo_servicio: string | null;
  numero_anos: number | string | null;
  costo_anualidad: number | string | null;
  adeudo_total: number | string | null;
  interes: number | string | null;
  ns_franquicia_asociado: string | null;
  ns_estatus_cliente: string | null;
  ns_estatus_cobranza: string | null;
  ns_metal: string | null;
  ns_no_molestar: string | null;
  ns_pago_automatico: string | null;
  ns_referencia_cie: string | null;
  ns_token: string | null;
  pagado_hasta_scu: string | null;
  pagado_hasta_tcu: string | null;
  pagado_hasta_adn: string | null;
  fp_scu: string | null;
  fp_tcu: string | null;
  fp_adn: string | null;
}

// Same NetSuite list netsuite_services.custrecord_cryo_tipodeserv uses (confirmed in labels.ts) -
// '1' Sangre/SCU, '2' Tejido/TCU, '3' ADN. No confirmed id represents "DX" yet.
const SERVTIPO_SCU = '1';
const SERVTIPO_TCU = '2';
const SERVTIPO_ADN = '3';
// Same list, the two additional codes Tipo de Servicio needs (confirmed in labels.ts's
// SERVICE_TYPE_LABELS) - '4' Diente, '15' Placenta.
const SERVTIPO_DIENTE = '4';
const SERVTIPO_PLACENTA = '15';
// custrecord_cryo_estatuspartida (see labels.ts's PARTIDA_STATUS_LABELS).
const PARTIDA_ESTATUS_PENDIENTE = '3';
const PARTIDA_ESTATUS_VENCIDO = '4';

/**
 * Costo de anualidad + Pagado Hasta (SCU/TCU/ADN) + FP (SCU/TCU/ADN) + Tipo de Servicio, all in
 * ONE scan of the contract's active netsuite_services rows via CROSS APPLY, instead of 8 separate
 * correlated subqueries each re-scanning the same handful of rows - this was most of the cost of
 * the CSV export (11 correlated subqueries x up to ~219k contracts, ~3.75ms/row -> ~14 minutes for
 * the full unfiltered export). ROW_NUMBER() PARTITION BY tipodeserv preserves the exact "most
 * recently modified row wins" tie-break the old TOP-1/ORDER BY subqueries used for the unlikely
 * case of more than one active service of the same type. NULLIF(..., '') keeps tipo_servicio NULL
 * (not '') when the contract has no active services, matching STRING_AGG's old empty-set
 * behavior (CONCAT treats NULL args as '', so with zero matching types it would otherwise
 * collapse to an empty string instead of NULL).
 */
const SERVICES_CROSS_APPLY_SQL = `CROSS APPLY (
  SELECT
    SUM(TRY_CONVERT(decimal(18,2), S.custrecord_cryo_precioanualtotal)) as costo_anualidad,
    MAX(CASE WHEN S.rn = 1 AND S.custrecord_cryo_tipodeserv = ? THEN S.custrecord_cryo_pagadohasta END) as pagado_hasta_scu,
    MAX(CASE WHEN S.rn = 1 AND S.custrecord_cryo_tipodeserv = ? THEN S.custrecord_cryo_pagadohasta END) as pagado_hasta_tcu,
    MAX(CASE WHEN S.rn = 1 AND S.custrecord_cryo_tipodeserv = ? THEN S.custrecord_cryo_pagadohasta END) as pagado_hasta_adn,
    MAX(CASE WHEN S.rn = 1 AND S.custrecord_cryo_tipodeserv = ? THEN S.custrecord_cryo_fecha_procesoserv END) as fp_scu,
    MAX(CASE WHEN S.rn = 1 AND S.custrecord_cryo_tipodeserv = ? THEN S.custrecord_cryo_fecha_procesoserv END) as fp_tcu,
    MAX(CASE WHEN S.rn = 1 AND S.custrecord_cryo_tipodeserv = ? THEN S.custrecord_cryo_fecha_procesoserv END) as fp_adn,
    NULLIF(STUFF(CONCAT(
      CASE WHEN MAX(CASE WHEN S.custrecord_cryo_tipodeserv = ? THEN 1 END) = 1 THEN '+S' END,
      CASE WHEN MAX(CASE WHEN S.custrecord_cryo_tipodeserv = ? THEN 1 END) = 1 THEN '+T' END,
      CASE WHEN MAX(CASE WHEN S.custrecord_cryo_tipodeserv = ? THEN 1 END) = 1 THEN '+D' END,
      CASE WHEN MAX(CASE WHEN S.custrecord_cryo_tipodeserv = ? THEN 1 END) = 1 THEN '+P' END,
      CASE WHEN MAX(CASE WHEN S.custrecord_cryo_tipodeserv = ? THEN 1 END) = 1 THEN '+A' END
    ), 1, 1, ''), '') as tipo_servicio
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY custrecord_cryo_tipodeserv ORDER BY lastmodifieddate_dt DESC) as rn
    FROM netsuite_services
    WHERE custrecord_cryo_idcontrato = C.netsuite_id AND isinactive = 'F'
  ) S
) SVC`;

const SERVICES_CROSS_APPLY_BINDINGS = [
  SERVTIPO_SCU, SERVTIPO_TCU, SERVTIPO_ADN,
  SERVTIPO_SCU, SERVTIPO_TCU, SERVTIPO_ADN,
  SERVTIPO_SCU, SERVTIPO_TCU, SERVTIPO_DIENTE, SERVTIPO_PLACENTA, SERVTIPO_ADN,
];

/**
 * Adeudo total + Interés + Numero de años, all in ONE scan of the contract's active
 * netsuite_partidas rows via CROSS APPLY, instead of 3 separate correlated subqueries (same
 * reasoning as SERVICES_CROSS_APPLY_SQL above). SUM(CASE ... END) with no ELSE relies on SQL
 * Server's SUM ignoring NULLs, so - like the old subqueries' plain WHERE-filtered SUM - it
 * returns NULL rather than 0 when a contract has partidas but none in the matching status/date
 * range, instead of silently turning a "no data" blank into a "$0.00".
 */
const PARTIDAS_CROSS_APPLY_SQL = `CROSS APPLY (
  SELECT
    SUM(CASE
      WHEN P.custrecord_cryo_estatuspartida = ? AND TRY_CONVERT(date, P.custrecord_cryo_fechapartida, 103) < CAST(GETDATE() AS date)
      THEN TRY_CONVERT(decimal(18,2), P.custrecord_cryo_importepartida)
    END) as adeudo_total,
    SUM(TRY_CONVERT(decimal(18,2), P.custrecord_cryo_interes)) as interes,
    COUNT(DISTINCT CASE
      WHEN P.custrecord_cryo_estatuspartida = ? AND TRY_CONVERT(int, P.custrecord_cryo_aniopartida) <= YEAR(GETDATE())
      THEN P.custrecord_cryo_aniopartida
    END) as numero_anos
  FROM netsuite_partidas P
  WHERE P.custrecord_cryo_numcontrato = C.netsuite_id AND P.isinactive = 'F'
) PART`;

const PARTIDAS_CROSS_APPLY_BINDINGS = [PARTIDA_ESTATUS_VENCIDO, PARTIDA_ESTATUS_PENDIENTE];

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
  qb.joinRaw(SERVICES_CROSS_APPLY_SQL, SERVICES_CROSS_APPLY_BINDINGS);
  qb.joinRaw(PARTIDAS_CROSS_APPLY_SQL, PARTIDAS_CROSS_APPLY_BINDINGS);
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
    'C.custrecord_cryo_fnacimientoconf as fecha_nacimiento_confirmada',
    db.raw(`MONTH(TRY_CONVERT(date, C.custrecord_cryo_fnacimientoconf, 103)) as mes_nacimiento`),
    'TITULAR2.custrecord_cryo_nombremiembro as titular2_nombre',
    'TITULAR2.custrecord_cryo_main_email as titular2_email',
    'TITULAR2.custrecord_cryo_telefonocelular as titular2_telefono',
    'DUENO.entityid as dueno',
    'C.custrecord_cryo_mx_franquiciaasociado as ns_franquicia_asociado',
    'C.custrecord_cryo_mx_estatus_cliente as ns_estatus_cliente',
    'C.custrecord_cryo_mx_estatus_cobranza as ns_estatus_cobranza',
    'C.custrecord_cryo_mx_clasificadormetal as ns_metal',
    'C.custrecord_cryo_mx_nomolestar as ns_no_molestar',
    'C.custrecord_cryo_mx_pagoautomatico as ns_pago_automatico',
    'C.custrecord_nso_nrp_num_ferencia_unico as ns_referencia_cie',
    'C.custrecord_nso_token as ns_token',
    db.raw(`(
      SELECT TOP 1 FM.custrecord_cryo_nombremiembro
      FROM netsuite_family_members FM
      WHERE FM.custrecord_cryo_idfamilia = C.custrecord_cryo_numerofamilia
        AND FM.custrecord_cryo_parentesco = '1'
      ORDER BY FM.netsuite_id
    ) as nombre_hijo`),
    'SVC.costo_anualidad as costo_anualidad',
    'PART.adeudo_total as adeudo_total',
    // Not filtered by estatuspartida/date like adeudo_total - confirmed live that
    // custrecord_cryo_interes is populated across every partida status (Vencido, Pagado,
    // Parcialmente pagado, Pendiente alike), not just overdue ones, so this is the contract's
    // total interest across every active partida, full stop.
    'PART.interes as interes',
    'SVC.pagado_hasta_scu as pagado_hasta_scu',
    'SVC.pagado_hasta_tcu as pagado_hasta_tcu',
    'SVC.pagado_hasta_adn as pagado_hasta_adn',
    'SVC.fp_scu as fp_scu',
    'SVC.fp_tcu as fp_tcu',
    'SVC.fp_adn as fp_adn',
    'SVC.tipo_servicio as tipo_servicio',
    'PART.numero_anos as numero_anos',
  );
}

export function buildCuentaRow(raw: RawCuentaRow): CuentaRow {
  return {
    netsuite_id: raw.netsuite_id,
    contrato: raw.contrato,
    folio_sistema_anterior: raw.folio_sistema_anterior,
    subsidiaria_id: raw.subsidiaria_id,
    titular_nombre: raw.titular_nombre,
    titular_email: raw.titular_email,
    titular_telefono: raw.titular_telefono,
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
    fecha_nacimiento_confirmada: raw.fecha_nacimiento_confirmada,
    mes_nacimiento: raw.mes_nacimiento,
    titular2_nombre: raw.titular2_nombre,
    titular2_email: raw.titular2_email,
    titular2_telefono: raw.titular2_telefono,
    numero_anos: raw.numero_anos !== null ? Number(raw.numero_anos) : null,
    adeudo_total: raw.adeudo_total !== null ? Number(raw.adeudo_total) : null,
    interes: raw.interes !== null ? Number(raw.interes) : null,
    costo_anualidad: raw.costo_anualidad !== null ? Number(raw.costo_anualidad) : null,
    tipo_servicio: raw.tipo_servicio,
    nombre_hijo: raw.nombre_hijo,
    referencia_cie: raw.ns_referencia_cie,
    zona: (raw.ns_franquicia_asociado && FRANQUICIA_ASOCIADO_LABELS[raw.ns_franquicia_asociado]) || null,
    fp_scu: raw.fp_scu,
    fp_tcu: raw.fp_tcu,
    fp_dx: null,
    fp_adn: raw.fp_adn,
    pago_automatico: ynFromNetSuiteFlag(raw.ns_pago_automatico),
    estatus_cliente: (raw.ns_estatus_cliente && MX_ESTATUS_CLIENTE_LABELS[raw.ns_estatus_cliente]) || null,
    estatus_cobranza: (raw.ns_estatus_cobranza && MX_ESTATUS_COBRANZA_LABELS[raw.ns_estatus_cobranza]) || null,
    metal: (raw.ns_metal && CLASIFICADOR_METAL_LABELS[raw.ns_metal]) || null,
    link_pago: buildLinkPago(raw.ns_token),
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

/**
 * Same unpaginated query as getCuentasForExport, but as a true row-by-row stream (knex's mssql
 * dialect streams rows off the tedious driver's own 'row' event, not a buffered wrapper) instead
 * of one big awaited array. The old export route awaited the whole ~219k-row result before writing
 * a single byte to the response - the user saw nothing for the entire query duration, then a
 * sudden full flush. Streaming lets the download start within a couple seconds (as soon as SQL
 * Server's sort + first joined rows are ready) and spreads the rest across the transfer, instead
 * of one long silent wait that reads as "stuck".
 */
export function streamCuentasForExport(
  db: Knex,
  params: Pick<CuentasParams, 'search' | 'subsidiary'>,
  restrictSubsidiaries: Set<string> | null,
): NodeJS.ReadableStream {
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const requestedSubsidiaries = parseSubsidiaryFilter(params.subsidiary);

  const qb = baseCuentasQuery(db, search);
  if (restrictSubsidiaries !== null) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  if (requestedSubsidiaries.size > 0) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, requestedSubsidiaries);

  return selectCuentaColumns(addOutputJoins(qb, search), db).orderBy('C.lastmodifieddate_dt', 'desc').stream();
}
