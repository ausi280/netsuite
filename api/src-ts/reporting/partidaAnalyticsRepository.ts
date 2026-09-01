import type { Knex } from 'knex';
import { applySubsidiaryRestriction } from './reportingRepository';

/** The 4 breakdown views the partidas graphs page supports. */
export type PartidaDimension = 'month' | 'status' | 'subsidiary' | 'servicetype';

export const PARTIDA_DIMENSIONS: PartidaDimension[] = ['month', 'status', 'subsidiary', 'servicetype'];

export interface PartidaBreakdownRow {
  /** Raw key: "YYYY-MM" for month, the raw NetSuite list-value id for the others. Display labels are owned by the frontend. */
  key: string;
  /** NetSuite currency internal id (e.g. "1" for MXN), or null if the partida has no currency set. */
  currency: string | null;
  count: number;
  sum: number;
}

const TABLE = 'netsuite_partidas';
const SUBSIDIARY_COLUMN = 'custrecord_cryo_subsidiaria_partida';
const CURRENCY_COLUMN = 'custrecord_cryo_monedapartida';
// custrecord_cryo_importepartida is stored as plain decimal text ("156", "80.5" - confirmed
// 100% TRY_CONVERT-able in this table), not a numeric column, hence the explicit cast in every
// SUM below rather than knex's plain `.sum(column)` helper.
const AMOUNT_SQL = `TRY_CONVERT(decimal(18,2), custrecord_cryo_importepartida)`;

const DIMENSION_COLUMNS: Record<Exclude<PartidaDimension, 'month'>, string> = {
  status: 'custrecord_cryo_estatuspartida',
  subsidiary: SUBSIDIARY_COLUMN,
  servicetype: 'custrecord_cryo_servtipo',
};

/**
 * SQL Server GROUP BY doesn't accept a column alias, so the same FORMAT/TRY_CONVERT
 * expression used in SELECT must be repeated verbatim in GROUP BY - `custrecord_cryo_fechapartida`
 * is a raw NetSuite locale date string ("DD/MM/YYYY", confirmed 100% parseable in this table),
 * not a parsed datetime column, so this is the one dimension needing a raw SQL expression
 * rather than a plain column name.
 */
const MONTH_BUCKET_SQL = `FORMAT(TRY_CONVERT(date, custrecord_cryo_fechapartida, 103), 'yyyy-MM')`;

/**
 * Aggregated count + sum of custrecord_cryo_importepartida, grouped by one of the 4 supported
 * dimensions AND by currency. `restrictSubsidiaries` (null = unrestricted/admin) is always
 * enforced regardless of which dimension is requested, so a subsidiary-restricted user's charts -
 * including the "by subsidiary" one - never surface totals for subsidiaries they can't see.
 *
 * Always grouped by currency (custrecord_cryo_monedapartida) in addition to the requested
 * dimension - this account mixes MXN/USD/EUR/COP/ARS/PEN/BRL, so a single blended sum per bucket
 * would be meaningless. The frontend splits the flat result back out into one panel per currency.
 */
export async function getPartidaBreakdown(
  db: Knex,
  dimension: PartidaDimension,
  restrictSubsidiaries: Set<string> | null,
): Promise<PartidaBreakdownRow[]> {
  if (dimension === 'month') {
    const qb = db(TABLE)
      .select(
        db.raw(
          `${MONTH_BUCKET_SQL} AS bucket, ?? AS currency, COUNT(*) AS cnt, SUM(${AMOUNT_SQL}) AS total`,
          [CURRENCY_COLUMN],
        ),
      )
      .whereNotNull('custrecord_cryo_fechapartida')
      .groupBy(db.raw(MONTH_BUCKET_SQL))
      .groupBy(CURRENCY_COLUMN);

    if (restrictSubsidiaries !== null) {
      applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
    }

    const rows = (await qb) as Array<{
      bucket: string | null;
      currency: string | null;
      cnt: number | string;
      total: number | string | null;
    }>;
    return rows
      .filter((row) => row.bucket)
      .map((row) => ({
        key: row.bucket as string,
        currency: row.currency,
        count: Number(row.cnt),
        sum: Number(row.total ?? 0),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  const column = DIMENSION_COLUMNS[dimension];
  const qb = db(TABLE)
    .select(db.raw(`?? AS grp, ?? AS currency, COUNT(*) AS cnt, SUM(${AMOUNT_SQL}) AS total`, [column, CURRENCY_COLUMN]))
    .groupBy(column)
    .groupBy(CURRENCY_COLUMN);

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }

  const rows = (await qb) as Array<{
    grp: string | null;
    currency: string | null;
    cnt: number | string;
    total: number | string | null;
  }>;
  return rows
    .filter((row) => row.grp !== null && row.grp !== '')
    .map((row) => ({ key: String(row.grp), currency: row.currency, count: Number(row.cnt), sum: Number(row.total ?? 0) }))
    .sort((a, b) => b.sum - a.sum);
}
