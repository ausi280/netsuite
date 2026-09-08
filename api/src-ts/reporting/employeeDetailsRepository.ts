import type { Knex } from 'knex';

/**
 * employee_details is a general-purpose "additional info about an employee" table (see the
 * migration's comment for why this isn't a column on netsuite_employees). `nivel_contratos` and
 * `nivel_otros_contratos` are its first two fields - a salesperson's Contratos sales and Otros
 * Contratos sales don't sum together for tier-resolution purposes (see commissionsRepository.ts),
 * so each needs its own independent nivel. More app-owned employee attributes are expected to
 * land here later as their own columns.
 */

const TABLE = 'employee_details';

export interface EmployeeDetailsRow {
  employee_netsuite_id: string;
  nivel_contratos: string | null;
  nivel_otros_contratos: string | null;
}

export interface EmployeeLevels {
  nivelContratos: string | null;
  nivelOtrosContratos: string | null;
}

/** Every employee with either nivel assigned, as a Map for O(1) lookup while enriching commission rows. */
export async function getEmployeeLevelsMap(db: Knex): Promise<Map<string, EmployeeLevels>> {
  const rows = await db<EmployeeDetailsRow>(TABLE).select('employee_netsuite_id', 'nivel_contratos', 'nivel_otros_contratos');
  return new Map(rows.map((row) => [row.employee_netsuite_id, { nivelContratos: row.nivel_contratos, nivelOtrosContratos: row.nivel_otros_contratos }]));
}

export interface SetEmployeeLevelsInput {
  nivel_contratos: string | null;
  nivel_otros_contratos: string | null;
}

/** Assigns (or clears, with a null) both of one employee's niveles at once - never deletes the
 * row, since other employee_details fields may exist on it independently of either nivel. */
export async function setEmployeeLevels(db: Knex, employeeNetsuiteId: string, input: SetEmployeeLevelsInput): Promise<void> {
  const existing = await db(TABLE).where({ employee_netsuite_id: employeeNetsuiteId }).first();
  if (existing) {
    await db(TABLE).where({ employee_netsuite_id: employeeNetsuiteId }).update({ ...input, updated_at: new Date() });
  } else {
    await db(TABLE).insert({ employee_netsuite_id: employeeNetsuiteId, ...input });
  }
}

export interface EmployeeWithLevels {
  netsuite_id: string;
  entityid: string | null;
  email: string | null;
  isinactive: boolean | null;
  nivel_contratos: string | null;
  nivel_otros_contratos: string | null;
}

/** Every synced employee (active and inactive) with their currently assigned niveles, if any - the
 * source list for the "assign niveles" admin screen. */
export async function getEmployeesWithLevels(db: Knex): Promise<EmployeeWithLevels[]> {
  return db('netsuite_employees as E')
    .leftJoin(`${TABLE} as D`, 'D.employee_netsuite_id', 'E.netsuite_id')
    .select('E.netsuite_id', 'E.entityid', 'E.email', 'E.isinactive', 'D.nivel_contratos', 'D.nivel_otros_contratos')
    .orderBy('E.entityid');
}
