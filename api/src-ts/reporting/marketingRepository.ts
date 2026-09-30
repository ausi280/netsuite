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
 * "No contactado" - Prospecto.ID_NoVenta values meaning the prospect was simply never reached,
 * confirmed live via Cryo.dbo.noventa per empresa:
 *  - empresa 1: 6 "Datos de contacto incorrectos", 12 "No se logró contactar"
 *  - empresa 2: 31 "El teléfono que dio no sirve o no contestan", 37 "No se logró contactar"
 *  - empresa 3: 56 "El teléfono que dio no sirve o no contestan", 62 "No se logró contactar"
 */
const NO_CONTACTADO_NOVENTA_IDS = [6, 12, 31, 37, 56, 62];

/**
 * "Lead no calificado" - Prospecto.ID_NoVenta values meaning the prospect was reached but was
 * never a real opportunity to begin with (not pregnant, not interested, a duplicate entry, junk,
 * a non-lead inquiry, or someone who was never actually shopping), confirmed live via
 * Cryo.dbo.noventa per empresa:
 *  - empresa 1: 10 "No está embarazada", 15 "No está interesado", 18 "Prospecto Duplicado",
 *    19 "Nos buscó para pagar su anualidad", 24 "Prospecto basura"
 *  - empresa 2: 35 "No está embarazada", 40 "No está interesado", 43 "Prospecto Duplicado",
 *    44 "Nos buscó para pagar su anualidad", 48 "No solicitó información", 49 "Prospecto basura"
 *  - empresa 3: 60 "No está embarazada", 65 "No está interesado", 68 "Prospecto Duplicado",
 *    69 "Nos buscó para pagar su anualidad", 73 "No solicitó información", 74 "Prospecto basura"
 *
 * "No solicitó información" has no exact empresa-1 equivalent (checked live) - its closest
 * relative there, id 23 "No está interesada en recibir la información", is worded differently and
 * was NOT explicitly named for this bucket, so it deliberately stays in Calificados. Visible (and
 * adjustable) in the per-motivo breakdown table if that should change.
 */
const LEAD_NO_CALIFICADO_NOVENTA_IDS = [10, 15, 18, 19, 24, 35, 40, 43, 44, 48, 49, 60, 65, 68, 69, 73, 74];

/** Every other ID_NoVenta value (a legitimate closed-lost reason, e.g. price, competitor, medical
 * complication) OR no ID_NoVenta at all (still open, or already converted to a sale) counts as
 * "Calificados" - the prospect was a real, reachable opportunity regardless of outcome. */
export type ProspectoQualificationCategory = 'Calificados' | 'No contactado' | 'Lead no calificado';

function categorizeNoVenta(idNoVenta: number | null): ProspectoQualificationCategory {
  if (idNoVenta === null) return 'Calificados';
  if (NO_CONTACTADO_NOVENTA_IDS.includes(idNoVenta)) return 'No contactado';
  if (LEAD_NO_CALIFICADO_NOVENTA_IDS.includes(idNoVenta)) return 'Lead no calificado';
  return 'Calificados';
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

  return Array.from(byKey.values()).sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));
}

export interface ProspectoQualificationSummary {
  calificados: number;
  no_contactado: number;
  lead_no_calificado: number;
  total: number;
}

/** One (year, month) bucket of the qualification chart, by Prospecto.FechaCaptura - same
 * year/month bucketing convention as SalesByMonthRow. */
export interface QualificationByMonthRow extends ProspectoQualificationSummary {
  anio: number;
  mes: number;
}

/** One row per distinct (year, month, empresa, motivo) actually present in the date range - shown
 * in full on the frontend, per explicit instruction to be transparent about exactly which raw
 * ID_NoVenta/Nombre combination rolled into which category in which month, so a future
 * re-categorization has a clear starting point instead of a black-box summary. */
export interface MotivoBreakdownRow {
  anio: number;
  mes: number;
  id_empresa: number;
  id_noventa: number | null;
  motivo: string;
  categoria: ProspectoQualificationCategory;
  cantidad: number;
}

export interface ProspectoQualificationResult {
  summary: ProspectoQualificationSummary;
  byMonth: QualificationByMonthRow[];
  motivos: MotivoBreakdownRow[];
}

interface RawMotivoRow {
  anio: number;
  mes: number;
  id_empresa: number;
  id_noventa: number | null;
  motivo: string | null;
  cantidad: number | string;
}

/** Label for the (very common) case of no ID_NoVenta at all - either the prospect is still open,
 * or it already converted to a sale. Both count as "Calificados" (see categorizeNoVenta). */
const SIN_MOTIVO_LABEL = '(Sin motivo - abierto o ya convertido a venta)';

function emptySummary(): ProspectoQualificationSummary {
  return { calificados: 0, no_contactado: 0, lead_no_calificado: 0, total: 0 };
}

function addToSummary(target: ProspectoQualificationSummary, categoria: ProspectoQualificationCategory, cantidad: number): void {
  if (categoria === 'No contactado') target.no_contactado += cantidad;
  else if (categoria === 'Lead no calificado') target.lead_no_calificado += cantidad;
  else target.calificados += cantidad;
  target.total += cantidad;
}

export async function getProspectoQualification(
  legacyDb: Knex,
  fechaInicial: string,
  fechaFinal: string,
): Promise<ProspectoQualificationResult> {
  const rows = (await legacyDb('Cryo.dbo.Prospecto as p')
    .leftJoin('Cryo.dbo.noventa as noventa', 'noventa.ID_NoVenta', 'p.ID_NoVenta')
    .whereIn('p.ID_Empresa', MARKETING_EMPRESA_IDS)
    .where('p.FechaCaptura', '>=', fechaInicial)
    .andWhere('p.FechaCaptura', '<', exclusiveUpperBound(fechaFinal))
    .groupByRaw('YEAR(p.FechaCaptura), MONTH(p.FechaCaptura), p.ID_Empresa, p.ID_NoVenta, noventa.Nombre')
    .select(
      legacyDb.raw('YEAR(p.FechaCaptura) as anio'),
      legacyDb.raw('MONTH(p.FechaCaptura) as mes'),
      'p.ID_Empresa as id_empresa',
      'p.ID_NoVenta as id_noventa',
      'noventa.Nombre as motivo',
      legacyDb.raw('COUNT(*) as cantidad'),
    )) as unknown as RawMotivoRow[];

  const summary = emptySummary();
  const byMonth = new Map<string, QualificationByMonthRow>();
  const motivos: MotivoBreakdownRow[] = [];

  for (const row of rows) {
    const cantidad = Number(row.cantidad);
    const categoria = categorizeNoVenta(row.id_noventa);

    addToSummary(summary, categoria, cantidad);

    const monthKey = `${row.anio}-${row.mes}`;
    const monthBucket = byMonth.get(monthKey) ?? { anio: row.anio, mes: row.mes, ...emptySummary() };
    addToSummary(monthBucket, categoria, cantidad);
    byMonth.set(monthKey, monthBucket);

    motivos.push({
      anio: row.anio,
      mes: row.mes,
      id_empresa: row.id_empresa,
      id_noventa: row.id_noventa,
      motivo: row.motivo ?? SIN_MOTIVO_LABEL,
      categoria,
      cantidad,
    });
  }

  const sortedByMonth = Array.from(byMonth.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
  motivos.sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes) || (b.cantidad - a.cantidad));

  return { summary, byMonth: sortedByMonth, motivos };
}
