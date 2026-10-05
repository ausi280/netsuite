import type { ProspectoCanal, TareasByVendedorRow, TareasCountRow } from '../api/types';
import type { TareasBucket } from '../components/charts/ComercialTareasChart';
import type { TareasByMonthStack } from '../components/charts/ComercialTareasByMonthChart';

/** Top-of-page Activos/Todos switch state - 'active' keeps only Cryo.dbo.Prospecto.Activo = true
 * rows, 'all' keeps everything (the historical default). Every bucket/total function below
 * expects rows already filtered by this (see filterByActivo), rather than taking the filter
 * itself - keeps them agnostic to where the rows came from (global vs. porVendedor). */
export type ActivoFilter = 'all' | 'active';

export function filterByActivo<T extends { activo: boolean }>(rows: T[], filter: ActivoFilter): T[] {
  return filter === 'active' ? rows.filter((row) => row.activo) : rows;
}

/** Online/Offline split (see ProspectoCanal) - unlike activo, this is never a "both" switch: every
 * panel always shows Online and Offline side by side (same convention as the Marketing report's
 * qualification chart), so callers just filter to one canal at a time for each side. */
export function filterByCanal<T extends { canal: ProspectoCanal }>(rows: T[], canal: ProspectoCanal): T[] {
  return rows.filter((row) => row.canal === canal);
}

/** 0..9 shown individually (covers ~97% of prospectos in practice - confirmed against real data),
 * everything from 10 up collapsed into one "10+" bucket so the chart stays a readable dozen bars
 * instead of a long thin tail of near-empty ones (real data has outliers up to 32). */
const MAX_DISCRETE_TAREAS = 9;

function bucketKey(tareas: number): string {
  return tareas > MAX_DISCRETE_TAREAS ? `${MAX_DISCRETE_TAREAS + 1}+` : String(tareas);
}

/** Fixed left-to-right order (0,1,2,...,9,10+) rather than sorting by count - a bucketed axis
 * should read as a progression, not shuffle by size. */
function orderedBucketKeys(): string[] {
  const keys = Array.from({ length: MAX_DISCRETE_TAREAS + 1 }, (_, i) => String(i));
  keys.push(`${MAX_DISCRETE_TAREAS + 1}+`);
  return keys;
}

export function bucketTareasCounts(rows: TareasCountRow[]): TareasBucket[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = bucketKey(row.tareas);
    totals.set(key, (totals.get(key) ?? 0) + row.cantidad);
  }
  return orderedBucketKeys()
    .filter((key) => totals.has(key))
    .map((key) => ({ key, count: totals.get(key)! }));
}

/**
 * The same real person/account often has several Cryo.dbo.Vendedor rows (and so several distinct
 * id_vendedor values) - either an exact duplicate name entered twice, or the same name with a
 * trailing brand tag (" BCU", " BSCU", " CRYOCELL", " CRYO", " FCELLS", sometimes parenthesized)
 * for selling under a different brand/subsidiary. Confirmed live via a full self-join over every
 * Cryo.dbo.Vendedor row (not just the Comercial report's own date range) - this is the complete
 * set of brand tags actually in use; every other "suffix" that same scan turned up (surnames like
 * "DELGADO"/"MARTINEZ", city tags like "IRAPUATO", role tags like "(DIRECTOR)") is a coincidental
 * name-prefix match between two genuinely different people, not a brand duplicate, so none of
 * those are stripped.
 */
const BRAND_SUFFIXES = ['BCU', 'BSCU', 'CRYOCELL', 'CRYO', 'FCELLS'];

function stripBrandSuffix(name: string): string {
  return name.replace(new RegExp(`\\s*\\(?(${BRAND_SUFFIXES.join('|')})\\)?\\s*$`, 'i'), '').trim();
}

/** Accents are folded (NFD + strip combining marks) on top of the brand-suffix strip above -
 * confirmed live that the same person's several Vendedor rows don't even agree on this (e.g.
 * "JOKABED JIMENEZ LOPEZ" vs "JOKABED JIMENEZ LÓPEZ BSCU"), so without folding, two rows for the
 * same real person land in different groups even after the suffix is stripped. This is the
 * grouping KEY only - see listVendedores for the separately-chosen display label, which keeps the
 * accent instead of showing the folded form to the user. */
function normalizeVendedorName(nombre: string | null): string {
  if (!nombre) return '';
  const collapsed = nombre.trim().replace(/\s+/g, ' ');
  return stripBrandSuffix(collapsed)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

export function bucketTareasCountsForVendedor(rows: TareasByVendedorRow[], vendedorKey: string): TareasBucket[] {
  return bucketTareasCounts(rows.filter((row) => normalizeVendedorName(row.vendedor) === vendedorKey));
}

function hasAccent(s: string): boolean {
  return s !== s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export interface GroupedVendedorOption {
  /** The normalized (accent-folded, suffix-stripped) name - used as the filter key every
   * bucketXForVendedor function above/below expects. */
  key: string;
  /** A real, unfolded spelling picked from the group's own raw names (preferring one with an
   * accent, since that's usually the correctly-spelled variant) - shown to the user. */
  label: string;
  /** Every raw id_vendedor that normalizes to this group - needed wherever the merged group must
   * drive a server-side `WHERE ID_Vendedor IN (...)` filter (e.g. the Tareas Vencidas report),
   * rather than just display a merged label. */
  ids: number[];
}

/** Groups raw (id_vendedor, vendedor) pairs by normalizeVendedorName, sorted by label - the one
 * place every vendedor-dropdown in this app (Comercial's own, and Tareas Vencidas') builds its
 * deduped option list from. */
export function groupVendedorOptions(options: Array<{ id_vendedor: number; vendedor: string | null }>): GroupedVendedorOption[] {
  const groups = new Map<string, GroupedVendedorOption>();
  for (const option of options) {
    const key = normalizeVendedorName(option.vendedor);
    if (!key) continue;
    const candidate = stripBrandSuffix((option.vendedor ?? '').trim().replace(/\s+/g, ' '));
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, label: candidate, ids: [option.id_vendedor] });
    } else {
      existing.ids.push(option.id_vendedor);
      if (hasAccent(candidate) && !hasAccent(existing.label)) existing.label = candidate;
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/** Distinct vendedores present in the period, grouped by normalizeVendedorName and sorted by name
 * - for the Comercial report's own vendedor-select dropdown (which filters client-side rows it
 * already has by `key`, so it has no need for the underlying `ids` groupVendedorOptions also
 * tracks - see Tareas Vencidas' page for a dropdown that does need them). */
export function listVendedores(rows: TareasByVendedorRow[]): Array<{ key: string; label: string }> {
  return groupVendedorOptions(rows).map(({ key, label }) => ({ key, label }));
}

// Same month-label convention as MarketingQualificationChart.tsx/MarketingSalesChart.tsx -
// duplicated locally rather than shared, same per-file convention already used throughout this
// report (bucketKey/orderedBucketKeys above are the same pattern).
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthKey(anio: number, mes: number): string {
  return `${MONTH_LABELS[mes - 1] ?? mes} ${anio}`;
}

/** Coarser 5-bucket scheme for the stacked-by-month view: 11 individual tareas buckets would need
 * 11 distinct hues in a legend-bearing stacked chart, risking repeats past a ~9-hue cycle (the
 * dataviz skill's categorical-palette anti-pattern) - this one instead pairs with a genuine
 * sequential light->dark ramp (5 steps), so coarser-but-correctly-colored beats finer-but-not. */
const MONTH_STACK_BUCKETS = ['0', '1-2', '3-5', '6-9', '10+'] as const;
export type MonthStackBucketKey = (typeof MONTH_STACK_BUCKETS)[number];

function monthStackBucketKey(tareas: number): MonthStackBucketKey {
  if (tareas === 0) return '0';
  if (tareas <= 2) return '1-2';
  if (tareas <= 5) return '3-5';
  if (tareas <= 9) return '6-9';
  return '10+';
}

function emptyMonthStack(anio: number, mes: number): TareasByMonthStack {
  return { key: formatMonthKey(anio, mes), anio, mes, '0': 0, '1-2': 0, '3-5': 0, '6-9': 0, '10+': 0 };
}

function bucketTareasByMonthRows(rows: TareasCountRow[]): TareasByMonthStack[] {
  const map = new Map<string, TareasByMonthStack>();
  for (const row of rows) {
    const monthKey = `${row.anio}-${row.mes}`;
    const stack = map.get(monthKey) ?? emptyMonthStack(row.anio, row.mes);
    stack[monthStackBucketKey(row.tareas)] += row.cantidad;
    map.set(monthKey, stack);
  }
  return Array.from(map.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

export function bucketTareasByMonth(rows: TareasCountRow[]): TareasByMonthStack[] {
  return bucketTareasByMonthRows(rows);
}

export function bucketTareasByMonthForVendedor(rows: TareasByVendedorRow[], vendedorKey: string): TareasByMonthStack[] {
  return bucketTareasByMonthRows(rows.filter((row) => normalizeVendedorName(row.vendedor) === vendedorKey));
}

/** One vendedor's prospectos by (año, mes), ignoring the tareas dimension entirely - a single
 * count series, reusing ComercialTareasChart (fed a plain month label as its x-axis key instead
 * of a tareas bucket). Combines every id_vendedor that normalizes to vendedorKey (see
 * normalizeVendedorName) into one (año, mes) total rather than one series per underlying id.
 * Callers pre-filter rows by the Activos/Todos switch via filterByActivo before calling this, so
 * it reads "prospectos activos por mes" when fed activo-only rows, or "prospectos totales por
 * mes" when fed everything. */
export function totalByMonthForVendedor(rows: TareasByVendedorRow[], vendedorKey: string): TareasBucket[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (normalizeVendedorName(row.vendedor) !== vendedorKey) continue;
    const monthKey = `${row.anio}-${row.mes}`;
    totals.set(monthKey, (totals.get(monthKey) ?? 0) + row.cantidad);
  }
  return Array.from(totals.entries())
    .map(([monthKey, count]) => {
      const [anio, mes] = monthKey.split('-').map(Number);
      return { anio, mes, count };
    })
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
    .map(({ anio, mes, count }) => ({ key: formatMonthKey(anio, mes), count }));
}

interface MonthCount {
  anio: number;
  mes: number;
  cantidad: number;
}

/** Sums `cantidad` per (año, mes) - used for the Tareas Vencidas global/por-vendedor charts,
 * which are already aggregated server-side (see getTareasVencidasByMonth), unlike the tareas-per-
 * prospecto buckets above. Summing (rather than assuming one row per month) still matters for the
 * per-vendedor variant below, where several raw id_vendedor rows merged under one dropdown entry
 * can each contribute their own row for the same month. */
function bucketMonthCounts(rows: MonthCount[]): TareasBucket[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const monthKey = `${row.anio}-${row.mes}`;
    totals.set(monthKey, (totals.get(monthKey) ?? 0) + row.cantidad);
  }
  return Array.from(totals.entries())
    .map(([monthKey, count]) => {
      const [anio, mes] = monthKey.split('-').map(Number);
      return { anio, mes, count };
    })
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
    .map(({ anio, mes, count }) => ({ key: formatMonthKey(anio, mes), count }));
}

/** Tareas Vencidas, globally by (año, mes) - see TareaVencidaMonthRow. */
export function bucketTareaVencidasByMonth(rows: MonthCount[]): TareasBucket[] {
  return bucketMonthCounts(rows);
}

/** Tareas Vencidas by (año, mes), filtered to the given underlying id_vendedor set - the Comercial
 * page already has the selected dropdown entry's merged `ids` (see GroupedVendedorOption), so this
 * takes ids directly instead of re-deriving them via normalizeVendedorName. */
export function bucketTareaVencidasByMonthForVendedores(
  rows: Array<MonthCount & { id_vendedor: number }>,
  vendedorIds: number[],
): TareasBucket[] {
  if (vendedorIds.length === 0) return [];
  const idSet = new Set(vendedorIds);
  return bucketMonthCounts(rows.filter((row) => idSet.has(row.id_vendedor)));
}
