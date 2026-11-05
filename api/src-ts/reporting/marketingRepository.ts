import type { Knex } from 'knex';

/**
 * "Reporte de Marketing" - two charts against the legacy Cryo.dbo database (same one
 * prospectosRepository.ts/commissionsRepository.ts already read from), scoped to ID_Empresa IN
 * (1, 2, 3) - the three Mexican brands (CRYO-CELL DE MEXICO / CELULAS DE CORDON UMBILICAL (BCU) /
 * OPERADORA BSCU) - per explicit instruction that the other empresas (7=BioCells/Argentina,
 * 10=CordCell/Brazil, 11=FCells, 12=?) don't matter for this report.
 *
 * The sales-by-month chart queries Cryo.dbo.Contrato directly, NOT through Prospecto - see
 * getSalesByMonth's own comment: a real sale doesn't require a Prospecto row at all, and joining
 * from Prospecto silently undercounted real sales (confirmed live: September 2026 has 50 sold
 * contracts under empresas 1/2/3, but only 48 had a matching Prospecto row). The qualification
 * chart/table still comes from Prospecto, since ID_NoVenta/motivo are Prospecto-only concepts.
 *
 * IMPORTANT: every id below is empresa-specific - Cryo.dbo.Canal/TipoCanal/noventa are NOT shared
 * across empresas (each of the 3 Mexican brands has its own distinct row/id range, even for the
 * "same" concept, e.g. each has its own "Página de la empresa" Canal row). Any id list here was
 * confirmed live against the actual table contents for empresas 1/2/3 specifically, not guessed
 * from empresa 1 alone - a naive single-empresa id list would have silently misclassified the
 * ~145k Prospecto rows belonging to empresas 2 and 3.
 */

/**
 * Online vs offline split, per the "sales channel" chart - based on Prospecto.ID_TipoCanal (the
 * broader channel *category*, not the specific Canal row), confirmed live via
 * Cryo.dbo.TipoCanal: id 1 (empresa 1), 16 (empresa 2) and 29 (empresa 3) are each that empresa's
 * own "Internet" TipoCanal - every other TipoCanal id (Expo, Revista, Folletos, Cliente/Familiar/
 * Amigo, Médico, etc.) counts as offline. A prospecto with none of these three ids is offline.
 */
const ONLINE_TIPO_CANAL_IDS = [1, 16, 29];

/**
 * Lead classification per CryoCell's lead scoring workbook (status precedence and closure catalog),
 * adapted to what the CRM actually records. Differences from the workbook, all forced by the data:
 *  - No 0-100 score, so no "calificado" vs "en seguimiento" split or A/B/C priority: the CRM has no
 *    intent or relationship field and no public/private hospital type. "Prospecto" is the workbook's
 *    own prospect definition (calificado + en seguimiento): contacted and passing the three filters.
 *  - No "effective contact" timestamp, so a conversation is inferred (see classifyLead).
 *  - F1 has no field: it only fails through the "No está embarazada" motivo.
 *  - F2 reads the lead's city, not the birth location, which isn't captured.
 */
export const LEAD_RULES = {
  /** Attempts with no conversation before a lead is "No contactado". */
  MIN_ATTEMPTS_NO_CONTACTADO: 5,
  /** F3's minimum weeks between capture and FPP. 0 = the baby isn't born yet. Pending Operations. */
  F3_MIN_WEEKS_REMAINING: 0,
  /** Cryo.dbo.Estado.ID_Pais of México. */
  MEXICO_PAIS_ID: 1,
  /** Etapa.Avance of the initial "Contacto" stage, in all 3 empresas. Past it, someone really talked
   * to the lead. */
  ETAPA_INICIAL_AVANCE: 20,
  /** SWProspecto_Guardar sets FechaProbable = capture + 14 days on web/WhatsApp intake when no due
   * date is known, so this exact offset is a placeholder and not a real FPP. */
  FPP_PLACEHOLDER_DIAS: 14,
};

/** TipoTarea rows that count as a contact attempt, when closed: "Llamada telefónica" (1, 5, 9) and
 * "Whatsapp" (4, 8, 12), per empresa. */
const ATTEMPT_TIPO_TAREA_IDS = [1, 4, 5, 8, 9, 12];

/**
 * Closure catalog, per empresa's own Cryo.dbo.noventa ids (empresa 1 / 2 / 3), confirmed live.
 * CRM names differ from the workbook's in places, e.g. "Nos buscó para pagar su anualidad" = "Clienta
 * actual", "Cierre automático por FPP" = "Venció". The workbook's "Parto fuera de México" and "Ya
 * nació" don't exist in the CRM - F2 and F3 only fail from the city and the FPP.
 *
 * Id 23 "No está interesada en recibir la información" isn't in the workbook - grouped with "No está
 * interesada" (commercial loss), the closest reason there.
 */
const CLOSURE_GROUPS = {
  no_contactado: [
    6, 12, 149, // "Datos de contacto incorrectos", "No se logró contactar", "Cuelga las llamadas..."
    31, 37, 150, // "El teléfono que dio no sirve...", "No se logró contactar", "Cuelga las llamadas..."
    56, 62, 151, // same as empresa 2
  ],
  invalido: [
    18, 19, 24, 143, 146, // duplicado, anualidad, basura, "no solicitó información", "no registró sus datos"
    43, 44, 48, 49, 131, 133, 144, 147, // + "No solicitó información", franquicia, "por otro motivo"
    68, 69, 73, 74, 145, 148,
  ],
  no_calificado: [10, 35, 60], // "No está embarazada" (F1)
  perdida_no_comercial: [
    1, 5, 14, 16, // "Se adelantó el bebé", complicaciones, "Perdió al bebé", historia clínica afirmativa
    26, 30, 39, 41,
    51, 55, 64, 66,
  ],
  perdida_comercial: [
    2, 3, 4, 7, 8, 9, 11, 13, 15, 17, 20, 21, 22, 23, 25, 140,
    27, 28, 29, 32, 33, 34, 36, 38, 40, 42, 45, 46, 47, 50, 132, 141,
    52, 53, 54, 57, 58, 59, 61, 63, 65, 67, 70, 71, 72, 75, 142,
  ],
} as const;

type ClosureGroup = keyof typeof CLOSURE_GROUPS;

const CLOSURE_GROUP_BY_ID = new Map<number, ClosureGroup>(
  (Object.keys(CLOSURE_GROUPS) as ClosureGroup[]).flatMap((group) => CLOSURE_GROUPS[group].map((id): [number, ClosureGroup] => [id, group])),
);

/** "Cierre automático por FPP mayor a 60 días" - a commercial loss per the workbook, but closed by a
 * job, so unlike every other loss reason it says nothing about anyone having talked to the lead
 * (confirmed live: 683 of 858 have no closed task at all). */
const CIERRE_AUTOMATICO_IDS: readonly number[] = [21, 46, 71];

export type ProspectoQualificationCategory =
  | 'Prospecto'
  | 'Contactado: datos incompletos'
  | 'En intento'
  | 'No contactado'
  | 'No calificado'
  | 'Lead inválido';

export type FppFilterValue = 'ok' | 'falla' | 'sin_dato' | 'placeholder';

export interface LeadFacts {
  idNoVenta: number | null;
  /** Name of idNoVenta's reason, for the explanation. */
  motivo: string | null;
  tieneContrato: boolean;
  avanceEtapa: number;
  /** Name of the stage, for the explanation. */
  etapa: string | null;
  intentos: number;
  idPais: number | null;
  fpp: FppFilterValue;
}

export interface LeadClassification {
  categoria: ProspectoQualificationCategory;
  /** Which mandatory filters failed - only set for "No calificado". */
  fallas: { f1: boolean; f2: boolean; f3: boolean } | null;
  /** Why it landed in this category, shown as-is in the lead grid. */
  razon: string;
}

/**
 * The single status decision, in the workbook's precedence order. A conversation is inferred from a
 * sale, a stage past "Contacto", or a closure reason only learned by talking to the lead. A
 * no-contact reason outweighs the stage, since the stage can be stale; it doesn't outweigh a sale.
 * A commercial loss never changes the status: a lost lead that passes the filters stays Prospecto.
 */
export function classifyLead(lead: LeadFacts): LeadClassification {
  const grupo = lead.idNoVenta === null ? null : (CLOSURE_GROUP_BY_ID.get(lead.idNoVenta) ?? null);
  if (grupo === 'invalido') return { categoria: 'Lead inválido', fallas: null, razon: `Motivo de cierre inválido: ${lead.motivo}.` };

  const esCierreAutomatico = lead.idNoVenta !== null && CIERRE_AUTOMATICO_IDS.includes(lead.idNoVenta);
  const motivoImplicaConversacion = grupo !== null && grupo !== 'no_contactado' && !esCierreAutomatico;
  const conversacion =
    lead.tieneContrato || (grupo !== 'no_contactado' && (motivoImplicaConversacion || lead.avanceEtapa > LEAD_RULES.ETAPA_INICIAL_AVANCE));

  if (!conversacion) {
    const { MIN_ATTEMPTS_NO_CONTACTADO: minIntentos } = LEAD_RULES;
    // A lead already closed isn't being attempted anymore, whatever its count of attempts.
    if (grupo === 'no_contactado') return { categoria: 'No contactado', fallas: null, razon: `Motivo de cierre: ${lead.motivo}.` };
    if (esCierreAutomatico) return { categoria: 'No contactado', fallas: null, razon: `${lead.motivo}, sin evidencia de conversación.` };
    if (lead.idNoVenta !== null) return { categoria: 'No contactado', fallas: null, razon: `Motivo de cierre fuera del catálogo (${lead.motivo ?? lead.idNoVenta}), sin evidencia de conversación.` };
    if (lead.intentos >= minIntentos) return { categoria: 'No contactado', fallas: null, razon: `${lead.intentos} intentos sin conversación registrada.` };
    return { categoria: 'En intento', fallas: null, razon: `${lead.intentos} de ${minIntentos} intentos, sin conversación registrada.` };
  }

  const fallas = {
    f1: grupo === 'no_calificado',
    f2: lead.idPais !== null && lead.idPais !== LEAD_RULES.MEXICO_PAIS_ID,
    f3: lead.fpp === 'falla',
  };
  if (fallas.f1 || fallas.f2 || fallas.f3) {
    const { F3_MIN_WEEKS_REMAINING: minSemanas } = LEAD_RULES;
    const razones = [
      fallas.f1 ? `F1: ${lead.motivo}` : null,
      fallas.f2 ? 'F2: la ciudad del lead está fuera de México' : null,
      fallas.f3 ? (minSemanas === 0 ? 'F3: la FPP es anterior a la captura' : `F3: faltaban menos de ${minSemanas} semanas para la FPP`) : null,
    ].filter(Boolean);
    return { categoria: 'No calificado', fallas, razon: `${razones.join('; ')}.` };
  }

  const evidencia = lead.tieneContrato
    ? 'tiene contrato'
    : motivoImplicaConversacion
      ? `motivo de cierre: ${lead.motivo}`
      : `etapa ${lead.etapa ?? lead.avanceEtapa}`;

  const faltantes = [
    lead.fpp === 'placeholder' ? 'FPP real (la actual es la asignada automáticamente al capturar)' : null,
    lead.fpp === 'sin_dato' ? 'FPP' : null,
    lead.idPais === null ? 'ciudad' : null,
  ].filter(Boolean);
  if (faltantes.length > 0) {
    return { categoria: 'Contactado: datos incompletos', fallas: null, razon: `Hubo conversación (${evidencia}), pero falta: ${faltantes.join(', ')}.` };
  }
  return { categoria: 'Prospecto', fallas: null, razon: `Hubo conversación (${evidencia}) y pasa los filtros F1, F2 y F3.` };
}

const MARKETING_EMPRESA_IDS = [1, 2, 3];

/** Next-day exclusive upper bound - same convention as prospectosRepository.ts's
 * exclusiveUpperBound, needed for both FechaCaptura and FechaVenta (real datetime columns). */
function exclusiveUpperBound(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export interface SalesByMonthRow {
  anio: number;
  mes: number;
  online: number;
  offline: number;
  total: number;
}

interface RawSalesByMonthRow {
  anio: number;
  mes: number;
  es_online: number;
  cantidad: number;
}

/**
 * Manual correction for months where Cryo.dbo.Contrato.ID_TipoCanal misclassified some real online
 * sales as offline - requested explicitly (2026-09-30) with the FINAL online value each of these
 * months should show, not a delta. Offline absorbs whatever difference is needed so the month's
 * total is unchanged (total is never touched by this map). Key is "YYYY-M" (no leading zero on
 * month), same convention as the byKey map below.
 */
const ONLINE_SALES_OVERRIDES: Record<string, number> = {
  '2026-2': 8,
  '2026-4': 8,
  '2026-5': 17,
  '2026-6': 9,
  '2026-7': 17,
  '2026-8': 9,
};

/**
 * Sales per year/month, split online/offline, bucketed by the CONTRACT's own sale date
 * (Contrato.FechaVenta) - the date a sale actually happened.
 *
 * Queried directly against Cryo.dbo.Contrato - NOT via a join from Prospecto - because a real,
 * closed sale doesn't require a Prospecto row at all: confirmed live for September 2026, Contrato
 * has 50 contracts sold under empresas 1/2/3 (37 empresa 1 + 11 empresa 2 + 2 empresa 3), while
 * joining from Prospecto (INNER JOIN ... ON contrato.ID_Contrato = p.ID_Contrato) only reached 48,
 * silently dropping 37 real sales account-wide whose Contrato has no matching Prospecto row at
 * all (out of 85 total Contrato rows that month before the empresa filter - the other 35 belong
 * to empresa 11/12, correctly out of scope). Contrato carries its own ID_Empresa/ID_TipoCanal, so
 * no Prospecto join is needed for this chart at all.
 */
export async function getSalesByMonth(legacyDb: Knex, fechaInicial: string, fechaFinal: string): Promise<SalesByMonthRow[]> {
  const rows = (await legacyDb('Cryo.dbo.Contrato as contrato')
    .whereIn('contrato.ID_Empresa', MARKETING_EMPRESA_IDS)
    .where('contrato.FechaVenta', '>=', fechaInicial)
    .andWhere('contrato.FechaVenta', '<', exclusiveUpperBound(fechaFinal))
    .select(
      legacyDb.raw('YEAR(contrato.FechaVenta) as anio'),
      legacyDb.raw('MONTH(contrato.FechaVenta) as mes'),
      legacyDb.raw(`IIF(contrato.ID_TipoCanal IN (${ONLINE_TIPO_CANAL_IDS.join(',')}), 1, 0) as es_online`),
      legacyDb.raw('COUNT(*) as cantidad'),
    )
    .groupByRaw(`YEAR(contrato.FechaVenta), MONTH(contrato.FechaVenta), IIF(contrato.ID_TipoCanal IN (${ONLINE_TIPO_CANAL_IDS.join(',')}), 1, 0)`)) as unknown as RawSalesByMonthRow[];

  const byKey = new Map<string, SalesByMonthRow>();
  for (const row of rows) {
    const key = `${row.anio}-${row.mes}`;
    const existing = byKey.get(key) ?? { anio: row.anio, mes: row.mes, online: 0, offline: 0, total: 0 };
    const cantidad = Number(row.cantidad);
    if (row.es_online) existing.online += cantidad;
    else existing.offline += cantidad;
    existing.total += cantidad;
    byKey.set(key, existing);
  }

  for (const [key, targetOnline] of Object.entries(ONLINE_SALES_OVERRIDES)) {
    const row = byKey.get(key);
    if (!row) continue; // no sales that month at all - nothing to correct
    row.online = targetOnline;
    row.offline = row.total - targetOnline;
  }

  return Array.from(byKey.values()).sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));
}

export interface ProspectoQualificationSummary {
  prospecto: number;
  datos_incompletos: number;
  en_intento: number;
  no_contactado: number;
  no_calificado: number;
  lead_invalido: number;
  total: number;
}

/** One (year, month, canal) bucket of the qualification chart, by Prospecto.FechaCaptura - same
 * year/month bucketing convention as SalesByMonthRow, further split online/offline the same way
 * (Prospecto.ID_TipoCanal, same ONLINE_TIPO_CANAL_IDS) so the chart can show one series per
 * channel instead of only a channel-blind total. */
export interface QualificationByMonthRow extends ProspectoQualificationSummary {
  anio: number;
  mes: number;
  canal: 'online' | 'offline';
}

/** No calificado leads per mandatory filter. A lead failing two counts in both. */
export interface FilterFailures {
  f1: number;
  f2: number;
  f3: number;
}

export interface ProspectoQualificationResult {
  summary: ProspectoQualificationSummary;
  byMonth: QualificationByMonthRow[];
  /** México only - Argentina isn't on the workbook's filters. */
  filterFailures: FilterFailures | null;
}

interface RawLeadFactsRow {
  anio: number;
  mes: number;
  id_noventa: number | null;
  motivo: string | null;
  es_online: number;
  tiene_contrato: number;
  avance_etapa: number;
  intentos: number;
  id_pais: number | null;
  fpp: FppFilterValue;
  cantidad: number | string;
}

const LEAD_SCOPE_SQL = `p.ID_Empresa IN (${MARKETING_EMPRESA_IDS.join(',')}) AND p.FechaCaptura >= ? AND p.FechaCaptura < ?`;
const ES_ONLINE_SQL = `IIF(p.ID_TipoCanal IN (${ONLINE_TIPO_CANAL_IDS.join(',')}), 1, 0)`;
const DIAS_A_FPP_SQL = 'DATEDIFF(day, p.FechaCaptura, p.FechaProbable)';
const FPP_FILTER_SQL = `CASE
    WHEN p.FechaProbable IS NULL THEN 'sin_dato'
    WHEN ${DIAS_A_FPP_SQL} = ${LEAD_RULES.FPP_PLACEHOLDER_DIAS} THEN 'placeholder'
    WHEN ${DIAS_A_FPP_SQL} < ${LEAD_RULES.F3_MIN_WEEKS_REMAINING * 7} THEN 'falla'
    ELSE 'ok' END`;

/** One row per in-scope prospecto: its furthest stage (a few have two Lead rows) and its total
 * attempts. Tareas are pre-aggregated rather than correlated per row, to stay well inside the legacy
 * pool's 30s request timeout on the report's default 12-month range. Takes LEAD_SCOPE_SQL's 2 bindings. */
const LEADS_CTE_SQL = `leads AS (
      SELECT x.ID_Prospecto, x.avance, x.etapa, x.intentos
      FROM (
        SELECT le.ID_Prospecto, et.Avance as avance, et.Nombre as etapa,
          ROW_NUMBER() OVER (PARTITION BY le.ID_Prospecto ORDER BY et.Avance DESC) as fila,
          SUM(ISNULL(ti.intentos, 0)) OVER (PARTITION BY le.ID_Prospecto) as intentos
        FROM Cryo.dbo.Lead le
        INNER JOIN Cryo.dbo.Prospecto p ON p.ID_Prospecto = le.ID_Prospecto AND ${LEAD_SCOPE_SQL}
        INNER JOIN Cryo.dbo.Etapa et ON et.ID_Etapa = le.ID_Etapa
        LEFT JOIN (
          SELECT t.ID_Lead, COUNT(*) as intentos
          FROM Cryo.dbo.Tarea t
          WHERE t.FechaCierre IS NOT NULL AND t.ID_TipoTarea IN (${ATTEMPT_TIPO_TAREA_IDS.join(',')})
          GROUP BY t.ID_Lead
        ) ti ON ti.ID_Lead = le.ID_Lead
      ) x
      WHERE x.fila = 1
    )`;

export function emptySummary(): ProspectoQualificationSummary {
  return { prospecto: 0, datos_incompletos: 0, en_intento: 0, no_contactado: 0, no_calificado: 0, lead_invalido: 0, total: 0 };
}

const SUMMARY_FIELD_BY_CATEGORY: Record<ProspectoQualificationCategory, Exclude<keyof ProspectoQualificationSummary, 'total'>> = {
  Prospecto: 'prospecto',
  'Contactado: datos incompletos': 'datos_incompletos',
  'En intento': 'en_intento',
  'No contactado': 'no_contactado',
  'No calificado': 'no_calificado',
  'Lead inválido': 'lead_invalido',
};

export function addToSummary(target: ProspectoQualificationSummary, categoria: ProspectoQualificationCategory, cantidad: number): void {
  target[SUMMARY_FIELD_BY_CATEGORY[categoria]] += cantidad;
  target.total += cantidad;
}

export async function getProspectoQualification(
  legacyDb: Knex,
  fechaInicial: string,
  fechaFinal: string,
): Promise<ProspectoQualificationResult> {
  const fechaLimite = exclusiveUpperBound(fechaFinal);
  const intentos = `IIF(ISNULL(l.intentos, 0) >= ${LEAD_RULES.MIN_ATTEMPTS_NO_CONTACTADO}, ${LEAD_RULES.MIN_ATTEMPTS_NO_CONTACTADO}, ISNULL(l.intentos, 0))`;

  // Grouped to one row per distinct combination of facts, then classified in TS - keeps the rules in
  // one place.
  const rows = (await legacyDb.raw(
    `WITH ${LEADS_CTE_SQL}
    SELECT
      YEAR(p.FechaCaptura) as anio,
      MONTH(p.FechaCaptura) as mes,
      p.ID_NoVenta as id_noventa,
      noventa.Nombre as motivo,
      ${ES_ONLINE_SQL} as es_online,
      IIF(p.ID_Contrato IS NOT NULL, 1, 0) as tiene_contrato,
      ISNULL(l.avance, 0) as avance_etapa,
      ${intentos} as intentos,
      estado.ID_Pais as id_pais,
      ${FPP_FILTER_SQL} as fpp,
      COUNT(*) as cantidad
    FROM Cryo.dbo.Prospecto p
    LEFT JOIN Cryo.dbo.noventa noventa ON noventa.ID_NoVenta = p.ID_NoVenta
    LEFT JOIN leads l ON l.ID_Prospecto = p.ID_Prospecto
    LEFT JOIN Cryo.dbo.Ciudad ciudad ON ciudad.ID_Ciudad = p.ID_Ciudad
    LEFT JOIN Cryo.dbo.Estado estado ON estado.ID_Estado = ciudad.ID_Estado
    WHERE ${LEAD_SCOPE_SQL}
    GROUP BY YEAR(p.FechaCaptura), MONTH(p.FechaCaptura), p.ID_NoVenta, noventa.Nombre, ${ES_ONLINE_SQL},
      IIF(p.ID_Contrato IS NOT NULL, 1, 0), ISNULL(l.avance, 0), ${intentos}, estado.ID_Pais, ${FPP_FILTER_SQL}`,
    [fechaInicial, fechaLimite, fechaInicial, fechaLimite],
  )) as unknown as RawLeadFactsRow[];

  const summary = emptySummary();
  const byMonth = new Map<string, QualificationByMonthRow>();
  const filterFailures: FilterFailures = { f1: 0, f2: 0, f3: 0 };

  for (const row of rows) {
    const cantidad = Number(row.cantidad);
    const { categoria, fallas } = classifyLead({
      idNoVenta: row.id_noventa,
      motivo: row.motivo,
      tieneContrato: Boolean(row.tiene_contrato),
      avanceEtapa: row.avance_etapa,
      etapa: null,
      intentos: row.intentos,
      idPais: row.id_pais,
      fpp: row.fpp,
    });
    const canal: 'online' | 'offline' = row.es_online ? 'online' : 'offline';

    addToSummary(summary, categoria, cantidad);
    if (fallas?.f1) filterFailures.f1 += cantidad;
    if (fallas?.f2) filterFailures.f2 += cantidad;
    if (fallas?.f3) filterFailures.f3 += cantidad;

    const monthKey = `${row.anio}-${row.mes}-${canal}`;
    const monthBucket = byMonth.get(monthKey) ?? { anio: row.anio, mes: row.mes, canal, ...emptySummary() };
    addToSummary(monthBucket, categoria, cantidad);
    byMonth.set(monthKey, monthBucket);
  }

  const sortedByMonth = Array.from(byMonth.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes || a.canal.localeCompare(b.canal));

  return { summary, byMonth: sortedByMonth, filterFailures };
}

/** One lead of the classification grid, with why it landed in its category. Both countries; the
 * fields Argentina doesn't have (intentos, fecha_probable, ciudad, vendedor) are null there. */
export interface LeadDetailRow {
  id: string;
  fecha_captura: Date | string | null;
  lead: string | null;
  empresa: string;
  canal: 'online' | 'offline';
  canal_nombre: string | null;
  etapa: string | null;
  intentos: number | null;
  fecha_probable: Date | string | null;
  ciudad: string | null;
  vendedor: string | null;
  motivo: string | null;
  categoria: ProspectoQualificationCategory;
  razon: string;
}

export interface LeadDetailFilters {
  categoria: ProspectoQualificationCategory | null;
  canal: 'online' | 'offline' | null;
}

/** Applied after classifying, since a category isn't a database column - the whole range is read
 * either way (a few seconds at most on a 12-month range), so the grid's counts always match the charts'. */
export function filterLeadDetails(rows: LeadDetailRow[], filters: LeadDetailFilters): LeadDetailRow[] {
  return rows.filter((row) => (!filters.categoria || row.categoria === filters.categoria) && (!filters.canal || row.canal === filters.canal));
}

const MEXICO_EMPRESA_LABELS: Record<number, string> = { 1: 'CRYO-CELL DE MEXICO', 2: 'BCU', 3: 'BSCU' };

interface RawLeadDetailRow {
  id_prospecto: number;
  fecha_captura: Date | string | null;
  lead: string | null;
  id_empresa: number;
  es_online: number;
  canal_nombre: string | null;
  etapa: string | null;
  avance_etapa: number;
  intentos: number;
  fecha_probable: Date | string | null;
  ciudad: string | null;
  vendedor: string | null;
  id_noventa: number | null;
  motivo: string | null;
  tiene_contrato: number;
  id_pais: number | null;
  fpp: FppFilterValue;
}

/** Every México lead in the range, newest first, through the same classifyLead as the charts. */
export async function getLeadDetails(legacyDb: Knex, fechaInicial: string, fechaFinal: string): Promise<LeadDetailRow[]> {
  const fechaLimite = exclusiveUpperBound(fechaFinal);
  const rows = (await legacyDb.raw(
    `WITH ${LEADS_CTE_SQL}
    SELECT
      p.ID_Prospecto as id_prospecto,
      CAST(p.FechaCaptura as date) as fecha_captura,
      COALESCE(NULLIF(LTRIM(RTRIM(p.MadreCompleto)), ''), NULLIF(LTRIM(RTRIM(p.PadreCompleto)), '')) as lead,
      p.ID_Empresa as id_empresa,
      ${ES_ONLINE_SQL} as es_online,
      canal.Nombre as canal_nombre,
      l.etapa as etapa,
      ISNULL(l.avance, 0) as avance_etapa,
      ISNULL(l.intentos, 0) as intentos,
      p.FechaProbable as fecha_probable,
      ciudad.Nombre as ciudad,
      vendedor.Nombre as vendedor,
      p.ID_NoVenta as id_noventa,
      noventa.Nombre as motivo,
      IIF(p.ID_Contrato IS NOT NULL, 1, 0) as tiene_contrato,
      estado.ID_Pais as id_pais,
      ${FPP_FILTER_SQL} as fpp
    FROM Cryo.dbo.Prospecto p
    LEFT JOIN Cryo.dbo.noventa noventa ON noventa.ID_NoVenta = p.ID_NoVenta
    LEFT JOIN leads l ON l.ID_Prospecto = p.ID_Prospecto
    LEFT JOIN Cryo.dbo.Ciudad ciudad ON ciudad.ID_Ciudad = p.ID_Ciudad
    LEFT JOIN Cryo.dbo.Estado estado ON estado.ID_Estado = ciudad.ID_Estado
    LEFT JOIN Cryo.dbo.Canal canal ON canal.ID_Canal = p.ID_Canal
    LEFT JOIN Cryo.dbo.Vendedor vendedor ON vendedor.ID_Vendedor = p.ID_Vendedor
    WHERE ${LEAD_SCOPE_SQL}
    ORDER BY p.FechaCaptura DESC`,
    [fechaInicial, fechaLimite, fechaInicial, fechaLimite],
  )) as unknown as RawLeadDetailRow[];

  return rows.map((row) => {
    const { categoria, razon } = classifyLead({
      idNoVenta: row.id_noventa,
      motivo: row.motivo,
      tieneContrato: Boolean(row.tiene_contrato),
      avanceEtapa: row.avance_etapa,
      etapa: row.etapa,
      intentos: row.intentos,
      idPais: row.id_pais,
      fpp: row.fpp,
    });
    return {
      id: String(row.id_prospecto),
      fecha_captura: row.fecha_captura,
      lead: row.lead,
      empresa: MEXICO_EMPRESA_LABELS[row.id_empresa] ?? String(row.id_empresa),
      canal: row.es_online ? 'online' : 'offline',
      canal_nombre: row.canal_nombre,
      etapa: row.etapa,
      intentos: row.intentos,
      fecha_probable: row.fecha_probable,
      ciudad: row.ciudad,
      vendedor: row.vendedor,
      motivo: row.motivo,
      categoria,
      razon,
    };
  });
}
