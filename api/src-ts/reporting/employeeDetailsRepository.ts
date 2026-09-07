import type { Knex } from 'knex';

/**
 * employee_details is a general-purpose "additional info about an employee" table (see the
 * migration's comment for why this isn't a column on netsuite_employees) - `nivel` (commission
 * level A/B/C/...) is only its first field, more app-owned employee attributes are expected to
 * land here later as their own columns.
 */

const TABLE = 'employee_details';

export interface EmployeeDetailsRow {
  employee_netsuite_id: string;
  nivel: string | null;
}

/** Every employee currently assigned a nivel, as a Map for O(1) lookup while enriching commission rows. */
export async function getEmployeeLevelsMap(db: Knex): Promise<Map<string, string>> {
  const rows = await db<EmployeeDetailsRow>(TABLE).whereNotNull('nivel').select('employee_netsuite_id', 'nivel');
  return new Map(rows.map((row) => [row.employee_netsuite_id, row.nivel as string]));
}

/** Assigns (or clears, with nivel: null) one employee's nivel - never deletes the row, since other
 * employee_details fields may exist on it independently of nivel. */
export async function setEmployeeLevel(db: Knex, employeeNetsuiteId: string, nivel: string | null): Promise<void> {
  const existing = await db(TABLE).where({ employee_netsuite_id: employeeNetsuiteId }).first();
  if (existing) {
    await db(TABLE).where({ employee_netsuite_id: employeeNetsuiteId }).update({ nivel, updated_at: new Date() });
  } else {
    await db(TABLE).insert({ employee_netsuite_id: employeeNetsuiteId, nivel });
  }
}

export interface EmployeeWithLevel {
  netsuite_id: string;
  entityid: string | null;
  email: string | null;
  isinactive: boolean | null;
  nivel: string | null;
}

/** Every synced employee (active and inactive) with their currently assigned nivel, if any - the
 * source list for the "assign a nivel to each salesperson" admin screen. */
export async function getEmployeesWithLevels(db: Knex): Promise<EmployeeWithLevel[]> {
  return db('netsuite_employees as E')
    .leftJoin(`${TABLE} as D`, 'D.employee_netsuite_id', 'E.netsuite_id')
    .select('E.netsuite_id', 'E.entityid', 'E.email', 'E.isinactive', 'D.nivel')
    .orderBy('E.entityid');
}
