import type { Knex } from 'knex';

/**
 * HR Report breakdown dimensions, backed by the Peopleforce/Sesame HR data warehouse
 * (DwhCryoholdcoLatam_Prod.dbo.Peopleforce_S_Employee - see api/src-ts/db/hrDbConnection.ts).
 * This is a current-state snapshot table (no termination-date history), so unlike partidas'
 * "por mes" trend, the only true time series available is hires-by-month (custrecord-free here -
 * plain `hiring_date`); there is no way to reconstruct historical headcount or turnover from it.
 */
export type HrDimension = 'brand' | 'department' | 'gender' | 'country' | 'status' | 'age' | 'seniority' | 'hiremonth';

export const HR_DIMENSIONS: HrDimension[] = ['brand', 'department', 'gender', 'country', 'status', 'age', 'seniority', 'hiremonth'];

export interface HrBreakdownRow {
  key: string;
  count: number;
}

export interface HrSummary {
  total: number;
  active: number;
  inactive: number;
}

const TABLE = 'Peopleforce_S_Employee';

/** Total/active/inactive headcount - always over the full table, regardless of any dimension filter. */
export async function getHrSummary(db: Knex): Promise<HrSummary> {
  const [{ total }, { active }] = await Promise.all([
    db(TABLE).count({ total: '*' }).first() as Promise<{ total: number | string }>,
    db(TABLE).where('active', 1).count({ active: '*' }).first() as Promise<{ active: number | string }>,
  ]);
  const totalNum = Number(total);
  const activeNum = Number(active);
  return { total: totalNum, active: activeNum, inactive: totalNum - activeNum };
}

// Age buckets - a plain int column, no natural grouping of its own.
const AGE_BUCKET_SQL = `CASE
  WHEN age IS NULL THEN 'Sin dato'
  WHEN age < 25 THEN '< 25'
  WHEN age < 35 THEN '25-34'
  WHEN age < 45 THEN '35-44'
  WHEN age < 55 THEN '45-54'
  ELSE '55+'
END`;

// Seniority is whole years of tenure; confirmed values can be 0 or slightly negative (e.g. -1) for
// very recently hired staff whose Sesame record hasn't crossed a full year yet - bucketed together
// with "< 1 year" rather than surfaced as their own nonsensical-looking category.
const SENIORITY_BUCKET_SQL = `CASE
  WHEN seniority IS NULL THEN 'Sin dato'
  WHEN seniority < 1 THEN '< 1 año'
  WHEN seniority < 3 THEN '1-2 años'
  WHEN seniority < 6 THEN '3-5 años'
  WHEN seniority < 11 THEN '6-10 años'
  ELSE '10+ años'
END`;

const STATUS_SQL = `CASE WHEN active = 1 THEN 'active' ELSE 'inactive' END`;

// SQL Server GROUP BY doesn't accept a column alias, so the same CASE/FORMAT expression used in
// SELECT must be repeated verbatim in GROUP BY - same convention as partidaAnalyticsRepository's
// MONTH_BUCKET_SQL.
const HIRE_MONTH_BUCKET_SQL = `FORMAT(hiring_date, 'yyyy-MM')`;

const DIMENSION_COLUMNS: Record<Exclude<HrDimension, 'age' | 'seniority' | 'status' | 'hiremonth'>, string> = {
  brand: 'brand_name',
  department: 'department_name',
  gender: 'gender_name',
  country: 'country_name',
};

/**
 * Headcount grouped by one of the supported dimensions. `activeOnly` filters to active=1 before
 * grouping - applied to every dimension except 'status' (which exists specifically to show the
 * active/inactive split, so it always covers the whole table regardless of that toggle) and
 * 'hiremonth' (a hire-date trend makes more sense read as "all hires over time", not "hires that
 * are still active today", though callers may still pass activeOnly for that view if they want it).
 */
export async function getHrBreakdown(db: Knex, dimension: HrDimension, activeOnly: boolean): Promise<HrBreakdownRow[]> {
  const applyActiveFilter = (qb: Knex.QueryBuilder) => {
    if (activeOnly && dimension !== 'status') {
      qb.andWhere('active', 1);
    }
  };

  if (dimension === 'hiremonth') {
    const qb = db(TABLE)
      .select(db.raw(`${HIRE_MONTH_BUCKET_SQL} AS grp, COUNT(*) AS cnt`))
      .whereNotNull('hiring_date')
      .groupBy(db.raw(HIRE_MONTH_BUCKET_SQL));
    applyActiveFilter(qb);

    const rows = (await qb) as Array<{ grp: string | null; cnt: number | string }>;
    return rows
      .filter((row) => row.grp)
      .map((row) => ({ key: row.grp as string, count: Number(row.cnt) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  if (dimension === 'age' || dimension === 'seniority' || dimension === 'status') {
    const bucketSql = dimension === 'age' ? AGE_BUCKET_SQL : dimension === 'seniority' ? SENIORITY_BUCKET_SQL : STATUS_SQL;
    const qb = db(TABLE)
      .select(db.raw(`${bucketSql} AS grp, COUNT(*) AS cnt`))
      .groupBy(db.raw(bucketSql));
    applyActiveFilter(qb);

    const rows = (await qb) as Array<{ grp: string; cnt: number | string }>;
    const result = rows.map((row) => ({ key: row.grp, count: Number(row.cnt) }));
    // Fixed, meaningful orderings rather than count-descending - a bucketed axis should read
    // youngest->oldest / newest->most-tenured / active-first, not shuffle by size.
    const order = dimension === 'age' ? ['< 25', '25-34', '35-44', '45-54', '55+', 'Sin dato']
      : dimension === 'seniority' ? ['< 1 año', '1-2 años', '3-5 años', '6-10 años', '10+ años', 'Sin dato']
      : ['active', 'inactive'];
    return result.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }

  const column = DIMENSION_COLUMNS[dimension];
  const qb = db(TABLE)
    .select(db.raw(`?? AS grp, COUNT(*) AS cnt`, [column]))
    .groupBy(column);
  applyActiveFilter(qb);

  const rows = (await qb) as Array<{ grp: string | null; cnt: number | string }>;
  return rows
    .filter((row) => row.grp !== null && row.grp !== '')
    .map((row) => ({ key: String(row.grp), count: Number(row.cnt) }))
    .sort((a, b) => b.count - a.count);
}
