import type { Knex } from 'knex';
import { getAgentIncentiveSchemes, type IncentiveScheme } from './cobranzaIncentivesRepository';

/** Monthly collections goals (metas) per Dueño/Cobrador - a month-wide default plus per-employee
 * overrides, see the migration 20261013000001_create_cobranza_goals_tables.js. Purely app-owned
 * config, not synced NetSuite data. */

const DEFAULTS_TABLE = 'cobranza_goal_defaults';
const GOALS_TABLE = 'cobranza_goals';
const EXCLUSIONS_TABLE = 'cobranza_goal_exclusions';
// Same placeholder cobranzaCommissionsRepository.ts excludes - not a real person.
const SIN_ASIGNAR_PLACEHOLDER = 'POR DEFINIR';

export interface CobranzaGoalPerson {
  employee_id: string;
  nombre: string;
  /** The employee's own override for this month, or null when they inherit the month's default. */
  override_amount: number | null;
  /** override_amount ?? the month's default (null when neither is set). */
  goal_amount: number | null;
  /** The agent's incentive esquema this month (see cobranzaIncentivesRepository.ts), or null. */
  scheme: IncentiveScheme | null;
}

export interface CobranzaGoalExcludedPerson {
  employee_id: string;
  nombre: string;
}

export interface CobranzaGoalsForMonth {
  year: number;
  month: number;
  default_amount: number | null;
  people: CobranzaGoalPerson[];
  /** Left out of goals this month - see getExclusions. */
  excluded: CobranzaGoalExcludedPerson[];
  /** The month the exclusions shown were stored for - this month once edited, else the earlier
   * month they're carried over from (null when none were ever set). */
  exclusion_source: { year: number; month: number } | null;
  /** The month the esquemas shown were stored for - this month once configured, else the earlier
   * month they're carried over from (null when none were ever set). */
  scheme_source: { year: number; month: number } | null;
}

/** The latest month at or before (year, month) with an exclusions snapshot of its own. */
async function findExclusionSnapshotMonth(db: Knex, year: number, month: number): Promise<{ year: number; month: number } | null> {
  const row = (await db(EXCLUSIONS_TABLE)
    .where('year', '<', year)
    .orWhere((b) => b.where('year', year).andWhere('month', '<=', month))
    .orderBy('year', 'desc')
    .orderBy('month', 'desc')
    .select('year', 'month')
    .first()) as { year: number; month: number } | undefined;
  return row ?? null;
}

/** Who's left out of goals for (year, month). Same snapshot scheme as the esquemas
 * (cobranzaIncentivesRepository.ts): every edited month stores its own complete list - a row with
 * `excluded` false marks someone restored that month - and a month nobody has edited yet shows the
 * latest earlier month's list, so placeholder employees ("COBRADOR 1", "OFICINA") don't have to be
 * removed again every month. */
async function getExclusions(db: Knex, year: number, month: number): Promise<{ ids: string[]; source: { year: number; month: number } | null }> {
  const source = await findExclusionSnapshotMonth(db, year, month);
  if (!source) return { ids: [], source };
  const rows = (await db(EXCLUSIONS_TABLE).where({ ...source, excluded: true }).select('employee_id')) as Array<{ employee_id: string }>;
  return { ids: rows.map((r) => r.employee_id), source };
}

/** Every active employee who is (or has been) a Dueño or Cobrador on any invoice/contract - the
 * roster goals are assigned to - plus anyone who already has an override stored for this month
 * (so an override never silently disappears if that person later goes inactive) - minus anyone
 * excluded this month, which always wins. */
async function getCobradorDuenoRoster(db: Knex, year: number, month: number, excludedIds: string[]): Promise<Array<{ employee_id: string; nombre: string }>> {
  const referencedIds = db
    .select('custbody_cryo_cobrador as employee_id')
    .from('netsuite_invoices')
    .whereNotNull('custbody_cryo_cobrador')
    .union((qb) => qb.select('custbody_cryo_duenio').from('netsuite_invoices').whereNotNull('custbody_cryo_duenio'))
    .union((qb) => qb.select('custrecord_cryo_duenio').from('netsuite_contracts').whereNotNull('custrecord_cryo_duenio'));

  const query = db('netsuite_employees as E')
    .leftJoin(GOALS_TABLE + ' as G', function (this: Knex.JoinClause) {
      this.on('G.employee_id', 'E.netsuite_id').andOn('G.year', db.raw('?', [year])).andOn('G.month', db.raw('?', [month]));
    })
    .whereNotNull('E.entityid')
    .whereNot('E.entityid', SIN_ASIGNAR_PLACEHOLDER);
  if (excludedIds.length > 0) query.whereNotIn('E.netsuite_id', excludedIds);

  const rows = (await query
    .andWhere((builder) => {
      builder
        .where((active) => active.whereIn('E.netsuite_id', referencedIds).andWhere((b) => b.whereNull('E.isinactive').orWhere('E.isinactive', false)))
        .orWhereNotNull('G.id');
    })
    .distinct('E.netsuite_id as employee_id', 'E.entityid as nombre')
    .orderBy('E.entityid', 'asc')) as Array<{ employee_id: string; nombre: string }>;

  return rows;
}

export async function getCobranzaGoals(db: Knex, year: number, month: number): Promise<CobranzaGoalsForMonth> {
  const exclusions = await getExclusions(db, year, month);
  const [defaultRow, overrides, roster, excluded, schemes] = await Promise.all([
    db(DEFAULTS_TABLE).where({ year, month }).select('amount').first() as Promise<{ amount: string | number } | undefined>,
    db(GOALS_TABLE).where({ year, month }).select('employee_id', 'amount') as Promise<Array<{ employee_id: string; amount: string | number }>>,
    getCobradorDuenoRoster(db, year, month, exclusions.ids),
    exclusions.source
      ? (db(EXCLUSIONS_TABLE + ' as X')
          .leftJoin('netsuite_employees as E', 'E.netsuite_id', 'X.employee_id')
          .where({ 'X.year': exclusions.source.year, 'X.month': exclusions.source.month, 'X.excluded': true })
          .select('X.employee_id', db.raw('COALESCE(E.entityid, X.employee_id) as nombre'))
          .orderBy('nombre') as Promise<CobranzaGoalExcludedPerson[]>)
      : Promise.resolve([]),
    getAgentIncentiveSchemes(db, year, month),
  ]);

  const defaultAmount = defaultRow ? Number(defaultRow.amount) : null;
  const overrideById = new Map(overrides.map((o) => [o.employee_id, Number(o.amount)]));

  return {
    year,
    month,
    default_amount: defaultAmount,
    people: roster.map((person) => {
      const override = overrideById.get(person.employee_id) ?? null;
      return {
        ...person,
        override_amount: override,
        goal_amount: override ?? defaultAmount,
        scheme: schemes.schemes.get(person.employee_id) ?? null,
      };
    }),
    excluded,
    exclusion_source: exclusions.source,
    scheme_source: schemes.source,
  };
}

/** Sets (or clears, with null) the month-wide default. When `clearOverrides` is true, every
 * per-employee override for that month is dropped too - "apply this one value to everyone". */
export async function setCobranzaGoalDefault(
  db: Knex,
  year: number,
  month: number,
  amount: number | null,
  clearOverrides: boolean,
): Promise<void> {
  await db.transaction(async (trx) => {
    if (amount === null) {
      await trx(DEFAULTS_TABLE).where({ year, month }).delete();
    } else {
      const updated = await trx(DEFAULTS_TABLE).where({ year, month }).update({ amount, updated_at: new Date() });
      if (!updated) await trx(DEFAULTS_TABLE).insert({ year, month, amount });
    }
    if (clearOverrides) {
      await trx(GOALS_TABLE).where({ year, month }).delete();
    }
  });
}

/** Sets (or clears, with null - back to inheriting the month's default) one employee's override. */
export async function setCobranzaGoalOverride(
  db: Knex,
  employeeId: string,
  year: number,
  month: number,
  amount: number | null,
): Promise<void> {
  const where = { employee_id: employeeId, year, month };
  if (amount === null) {
    await db(GOALS_TABLE).where(where).delete();
    return;
  }
  await db.transaction(async (trx) => {
    const updated = await trx(GOALS_TABLE).where(where).update({ amount, updated_at: new Date() });
    if (!updated) await trx(GOALS_TABLE).insert({ ...where, amount });
  });
}

/** Removes an employee from (or restores them to) the goals for (year, month) only. If the month has
 * no snapshot of its own yet, the one it was showing (latest earlier month) is first copied into it,
 * so the month becomes self-contained and edits to other months never change it. Their individual
 * overrides are kept, so restoring them brings their goal back as it was. */
export async function setCobranzaGoalExclusion(db: Knex, employeeId: string, year: number, month: number, excluded: boolean): Promise<void> {
  await db.transaction(async (trx) => {
    const source = await findExclusionSnapshotMonth(trx, year, month);
    if (source && (source.year !== year || source.month !== month)) {
      const inherited = (await trx(EXCLUSIONS_TABLE).where(source).select('employee_id', 'excluded')) as Array<{ employee_id: string; excluded: boolean }>;
      // Chunked - 4 parameters per row, under SQL Server's 2,100-per-request cap.
      for (let i = 0; i < inherited.length; i += 400) {
        const chunk = inherited.slice(i, i + 400);
        await trx(EXCLUSIONS_TABLE).insert(chunk.map((row) => ({ employee_id: row.employee_id, year, month, excluded: row.excluded })));
      }
    }

    const where = { employee_id: employeeId, year, month };
    const updated = await trx(EXCLUSIONS_TABLE).where(where).update({ excluded, updated_at: new Date() });
    if (!updated) await trx(EXCLUSIONS_TABLE).insert({ ...where, excluded });
  });
}
