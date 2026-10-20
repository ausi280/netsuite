import type { Knex } from 'knex';

/** Monthly inversión digital + funnel metas for the Reporte de Marketing (México) - app-owned,
 * captured by hand every month. See the migration
 * 20261017000001_create_marketing_monthly_inputs_table.js. */

const TABLE = 'marketing_monthly_inputs';

/** Country the inputs were captured for - the Reporte de Marketing covers México (legacy CRM) and
 * Argentina (NetSuite). Money is in that country's currency (MXN / ARS). */
export type MarketingPais = 'MX' | 'AR';
export const MARKETING_PAISES: MarketingPais[] = ['MX', 'AR'];

export const MARKETING_INPUT_FIELDS = [
  'inversion_digital',
  'meta_inversion_digital',
  'meta_leads_digital',
  'meta_leads_offline',
  'meta_prospectos',
  'meta_ventas_digital',
  'meta_ventas_total',
] as const;

export type MarketingInputField = (typeof MARKETING_INPUT_FIELDS)[number];

export type MarketingMonthlyInputs = { year: number; month: number } & Record<MarketingInputField, number | null>;

const toNumberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function toRow(raw: Record<string, unknown>): MarketingMonthlyInputs {
  const row = { year: Number(raw.year), month: Number(raw.month) } as MarketingMonthlyInputs;
  for (const field of MARKETING_INPUT_FIELDS) row[field] = toNumberOrNull(raw[field]);
  return row;
}

/** Every captured month whose (year, month) falls between the two dates' months, inclusive. */
export async function getMarketingInputsBetween(db: Knex, pais: MarketingPais, dateFrom: string, dateTo: string): Promise<MarketingMonthlyInputs[]> {
  const from = Number(dateFrom.slice(0, 4)) * 12 + Number(dateFrom.slice(5, 7));
  const to = Number(dateTo.slice(0, 4)) * 12 + Number(dateTo.slice(5, 7));
  const rows = (await db(TABLE)
    .where({ pais })
    .whereRaw('year * 12 + month BETWEEN ? AND ?', [from, to])
    .orderBy('year')
    .orderBy('month')
    .select('year', 'month', ...MARKETING_INPUT_FIELDS)) as Array<Record<string, unknown>>;
  return rows.map(toRow);
}

/** All 12 months of a year, captured or not (uncaptured months come back all-null). */
export async function getMarketingInputsForYear(db: Knex, pais: MarketingPais, year: number): Promise<MarketingMonthlyInputs[]> {
  const rows = (await db(TABLE).where({ pais, year }).select('year', 'month', ...MARKETING_INPUT_FIELDS)) as Array<Record<string, unknown>>;
  const byMonth = new Map(rows.map((r) => [Number(r.month), toRow(r)]));
  return Array.from({ length: 12 }, (_, i) => {
    const existing = byMonth.get(i + 1);
    if (existing) return existing;
    const empty = { year, month: i + 1 } as MarketingMonthlyInputs;
    for (const field of MARKETING_INPUT_FIELDS) empty[field] = null;
    return empty;
  });
}

/** Replaces one month's values (null clears a field). */
export async function saveMarketingInputs(db: Knex, pais: MarketingPais, input: MarketingMonthlyInputs): Promise<void> {
  const values: Record<string, number | null> = {};
  for (const field of MARKETING_INPUT_FIELDS) values[field] = input[field];
  const where = { pais, year: input.year, month: input.month };
  await db.transaction(async (trx) => {
    const updated = await trx(TABLE).where(where).update({ ...values, updated_at: new Date() });
    if (!updated) await trx(TABLE).insert({ ...where, ...values });
  });
}
