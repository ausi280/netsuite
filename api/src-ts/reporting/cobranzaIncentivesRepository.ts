import type { Knex } from 'knex';

/** Monthly cobranza incentive configuration - the "% recuperado" tier table for regular agentes de
 * cobranza (rate per subsidiaria / role column) and the amount thresholds for agentes de proyecto.
 * See the migration 20261015000001_create_cobranza_incentive_tables.js. Purely app-owned config,
 * captured every month; a month is always saved as a whole (both tables replaced at once). */

const TIERS_TABLE = 'cobranza_incentive_tiers';
const PROYECTO_TABLE = 'cobranza_proyecto_incentive_tiers';

/** The rate columns of the tier table, in display order - CCELL, BCU, BSCU and FCELLS are paid by
 * the subsidiaria of the cobranza; GTE CCELL / SUP. BCU / SUP. FCELLS are the managers' rates. */
export const INCENTIVE_RATE_KEYS = [
  'rate_ccell',
  'rate_bcu',
  'rate_bscu',
  'rate_fcells',
  'rate_gte_ccell',
  'rate_sup_bcu',
  'rate_sup_fcells',
] as const;

export type IncentiveRateKey = (typeof INCENTIVE_RATE_KEYS)[number];

/** An agent's esquema - one of the tier table's rate columns (scheme 'ccell' is paid from
 * rate_ccell, etc.), or 'proyecto' (paid from the proyecto amount thresholds instead). */
export const INCENTIVE_SCHEMES = ['ccell', 'bcu', 'bscu', 'fcells', 'gte_ccell', 'sup_bcu', 'sup_fcells', 'proyecto'] as const;

export type IncentiveScheme = (typeof INCENTIVE_SCHEMES)[number];

export function isIncentiveScheme(value: unknown): value is IncentiveScheme {
  return typeof value === 'string' && (INCENTIVE_SCHEMES as readonly string[]).includes(value);
}

const SCHEMES_TABLE = 'cobranza_agent_incentive_schemes';
const SNAPSHOT_INSERT_CHUNK = 400;

export type CobranzaIncentiveTier = {
  /** Lower bound of "% recuperado" (70 = 70%) - the tier runs up to the next tier's min_pct. */
  min_pct: number;
  /** "% de incentivo" as captured (e.g. "50%", "90 al 100%") - free text, not used in math. */
  incentive_label: string | null;
} & Record<IncentiveRateKey, number | null>;

export interface CobranzaProyectoIncentiveTier {
  /** Collected amount from which this rate applies (0, 160000...). */
  min_amount: number;
  /** Percentage paid (8.5 = 8.5%). */
  rate_pct: number;
}

export interface CobranzaIncentiveConfig {
  year: number;
  month: number;
  tiers: CobranzaIncentiveTier[];
  proyecto_tiers: CobranzaProyectoIncentiveTier[];
}

const toNumberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

async function readMonth(db: Knex, year: number, month: number): Promise<CobranzaIncentiveConfig> {
  const [tierRows, proyectoRows] = await Promise.all([
    db(TIERS_TABLE).where({ year, month }).orderBy('min_pct', 'asc').select('min_pct', 'incentive_label', ...INCENTIVE_RATE_KEYS),
    db(PROYECTO_TABLE).where({ year, month }).orderBy('min_amount', 'asc').select('min_amount', 'rate_pct'),
  ]);

  return {
    year,
    month,
    tiers: (tierRows as Array<Record<string, unknown>>).map((row) => {
      const tier = { min_pct: Number(row.min_pct), incentive_label: (row.incentive_label as string | null) ?? null } as CobranzaIncentiveTier;
      for (const key of INCENTIVE_RATE_KEYS) tier[key] = toNumberOrNull(row[key]);
      return tier;
    }),
    proyecto_tiers: (proyectoRows as Array<{ min_amount: string | number; rate_pct: string | number }>).map((row) => ({
      min_amount: Number(row.min_amount),
      rate_pct: Number(row.rate_pct),
    })),
  };
}

/** The most recent month before (year, month) that has any incentive configuration, or null. */
async function findPreviousConfiguredMonth(db: Knex, year: number, month: number): Promise<{ year: number; month: number } | null> {
  const before = (qb: Knex.QueryBuilder) => qb.where('year', '<', year).orWhere((b) => b.where('year', year).andWhere('month', '<', month));
  const latest = async (table: string) =>
    (await db(table).where(before).orderBy('year', 'desc').orderBy('month', 'desc').select('year', 'month').first()) as
      | { year: number; month: number }
      | undefined;

  const candidates = (await Promise.all([latest(TIERS_TABLE), latest(PROYECTO_TABLE)])).filter(
    (c): c is { year: number; month: number } => c !== undefined,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.year * 12 + a.month >= b.year * 12 + b.month ? a : b));
}

/** The month's configuration, plus - when nothing has been captured for that month yet - the most
 * recent earlier month's configuration as `copy_source`, so the capture screen can start from it. */
export async function getCobranzaIncentives(
  db: Knex,
  year: number,
  month: number,
): Promise<{ config: CobranzaIncentiveConfig; copy_source: CobranzaIncentiveConfig | null }> {
  const config = await readMonth(db, year, month);
  if (config.tiers.length > 0 || config.proyecto_tiers.length > 0) return { config, copy_source: null };

  const previous = await findPreviousConfiguredMonth(db, year, month);
  return { config, copy_source: previous ? await readMonth(db, previous.year, previous.month) : null };
}

/** Replaces the month's whole configuration (both tables) in one transaction. */
export async function saveCobranzaIncentives(
  db: Knex,
  year: number,
  month: number,
  tiers: CobranzaIncentiveTier[],
  proyectoTiers: CobranzaProyectoIncentiveTier[],
): Promise<void> {
  await db.transaction(async (trx) => {
    await trx(TIERS_TABLE).where({ year, month }).delete();
    await trx(PROYECTO_TABLE).where({ year, month }).delete();
    if (tiers.length > 0) {
      await trx(TIERS_TABLE).insert(tiers.map((tier) => ({ year, month, ...tier })));
    }
    if (proyectoTiers.length > 0) {
      await trx(PROYECTO_TABLE).insert(proyectoTiers.map((tier) => ({ year, month, ...tier })));
    }
  });
}

export interface AgentIncentiveSchemes {
  /** employee_id -> esquema for the month. Agents without one are absent. */
  schemes: Map<string, IncentiveScheme>;
  /** The month these assignments were stored for - (year, month) itself once that month has been
   * configured, else the latest earlier configured month it's shown from, or null if none. */
  source: { year: number; month: number } | null;
}

/** The month whose stored esquema snapshot applies to (year, month): that month itself if it has
 * any rows, else the latest earlier month that does. */
async function findSchemeSnapshotMonth(db: Knex, year: number, month: number): Promise<{ year: number; month: number } | null> {
  const row = (await db(SCHEMES_TABLE)
    .where('year', '<', year)
    .orWhere((b) => b.where('year', year).andWhere('month', '<=', month))
    .orderBy('year', 'desc')
    .orderBy('month', 'desc')
    .select('year', 'month')
    .first()) as { year: number; month: number } | undefined;
  return row ?? null;
}

/** Each agent's esquema for (year, month). Every month stores its own complete snapshot (see
 * setAgentIncentiveScheme); a month nobody has configured yet shows the latest earlier month's
 * snapshot, so assignments don't have to be re-picked from scratch each month. */
export async function getAgentIncentiveSchemes(db: Knex, year: number, month: number): Promise<AgentIncentiveSchemes> {
  const source = await findSchemeSnapshotMonth(db, year, month);
  const schemes = new Map<string, IncentiveScheme>();
  if (!source) return { schemes, source };

  const rows = (await db(SCHEMES_TABLE).where(source).select('employee_id', 'scheme')) as Array<{ employee_id: string; scheme: string | null }>;
  for (const row of rows) {
    if (isIncentiveScheme(row.scheme)) schemes.set(row.employee_id, row.scheme);
  }
  return { schemes, source };
}

/** Sets one agent's esquema for (year, month) only - null clears it for that month. If the month
 * has no snapshot of its own yet, the one it was showing (latest earlier month) is first copied into
 * it, so the month becomes self-contained and later edits to other months never change it. */
export async function setAgentIncentiveScheme(
  db: Knex,
  employeeId: string,
  year: number,
  month: number,
  scheme: IncentiveScheme | null,
): Promise<void> {
  await db.transaction(async (trx) => {
    const source = await findSchemeSnapshotMonth(trx, year, month);
    if (source && (source.year !== year || source.month !== month)) {
      const inherited = (await trx(SCHEMES_TABLE).where(source).select('employee_id', 'scheme')) as Array<{ employee_id: string; scheme: string | null }>;
      // Chunked - 4 parameters per row, under SQL Server's 2,100-per-request cap.
      for (let i = 0; i < inherited.length; i += SNAPSHOT_INSERT_CHUNK) {
        const chunk = inherited.slice(i, i + SNAPSHOT_INSERT_CHUNK);
        await trx(SCHEMES_TABLE).insert(chunk.map((row) => ({ employee_id: row.employee_id, year, month, scheme: row.scheme })));
      }
    }

    const where = { employee_id: employeeId, year, month };
    const updated = await trx(SCHEMES_TABLE).where(where).update({ scheme, updated_at: new Date() });
    if (!updated) await trx(SCHEMES_TABLE).insert({ ...where, scheme });
  });
}
