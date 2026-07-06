import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface EmployeeRow {
  netsuite_id: string;
  entityid: string | null;
  email: string | null;
  isinactive: boolean | null;
  lastmodifieddate: Date | null;
  raw_data: string;
}

/**
 * Writes to the new typed `netsuite_employees` table. The legacy
 * `syncEmployees()` path (netsuiteService.js:161-165) keeps writing to the
 * generic `netsuite_query_results` table untouched — both are additive and
 * never share rows.
 */
export class EmployeeRepository {
  private readonly table = 'netsuite_employees';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: EmployeeRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
