import type { Knex } from 'knex';

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
  /** Permanently left out of goals (every month) - see cobranza_goal_exclusions. */
  excluded: CobranzaGoalExcludedPerson[];
}

/** Every active employee who is (or has been) a Dueño or Cobrador on any invoice/contract - the
 * roster goals are assigned to - plus anyone who already has an override stored for this month
 * (so an override never silently disappears if that person later goes inactive) - minus anyone in
 * cobranza_goal_exclusions, which always wins. */
async function getCobradorDuenoRoster(db: Knex, year: number, month: number): Promise<Array<{ employee_id: string; nombre: string }>> {
  const referencedIds = db
    .select('custbody_cryo_cobrador as employee_id')
    .from('netsuite_invoices')
    .whereNotNull('custbody_cryo_cobrador')
    .union((qb) => qb.select('custbody_cryo_duenio').from('netsuite_invoices').whereNotNull('custbody_cryo_duenio'))
    .union((qb) => qb.select('custrecord_cryo_duenio').from('netsuite_contracts').whereNotNull('custrecord_cryo_duenio'));

  const rows = (await db('netsuite_employees as E')
    .leftJoin(GOALS_TABLE + ' as G', function (this: Knex.JoinClause) {
      this.on('G.employee_id', 'E.netsuite_id').andOn('G.year', db.raw('?', [year])).andOn('G.month', db.raw('?', [month]));
    })
    .whereNotNull('E.entityid')
    .whereNot('E.entityid', SIN_ASIGNAR_PLACEHOLDER)
    .whereNotIn('E.netsuite_id', db(EXCLUSIONS_TABLE).select('employee_id'))
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
  const [defaultRow, overrides, roster, excluded] = await Promise.all([
    db(DEFAULTS_TABLE).where({ year, month }).select('amount').first() as Promise<{ amount: string | number } | undefined>,
    db(GOALS_TABLE).where({ year, month }).select('employee_id', 'amount') as Promise<Array<{ employee_id: string; amount: string | number }>>,
    getCobradorDuenoRoster(db, year, month),
    db(EXCLUSIONS_TABLE + ' as X')
      .leftJoin('netsuite_employees as E', 'E.netsuite_id', 'X.employee_id')
      .select('X.employee_id', db.raw("COALESCE(E.entityid, X.employee_id) as nombre"))
      .orderBy('nombre') as Promise<CobranzaGoalExcludedPerson[]>,
  ]);

  const defaultAmount = defaultRow ? Number(defaultRow.amount) : null;
  const overrideById = new Map(overrides.map((o) => [o.employee_id, Number(o.amount)]));

  return {
    year,
    month,
    default_amount: defaultAmount,
    people: roster.map((person) => {
      const override = overrideById.get(person.employee_id) ?? null;
      return { ...person, override_amount: override, goal_amount: override ?? defaultAmount };
    }),
    excluded,
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

/** Adds an employee to (or removes them from) the permanent goals exclusion list. Their individual
 * overrides are kept, so restoring them brings their goals back as they were. */
export async function setCobranzaGoalExclusion(db: Knex, employeeId: string, excluded: boolean): Promise<void> {
  if (!excluded) {
    await db(EXCLUSIONS_TABLE).where({ employee_id: employeeId }).delete();
    return;
  }
  const existing = await db(EXCLUSIONS_TABLE).where({ employee_id: employeeId }).first();
  if (!existing) await db(EXCLUSIONS_TABLE).insert({ employee_id: employeeId });
}
