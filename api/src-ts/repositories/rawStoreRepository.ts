import type { Knex } from 'knex';
import type { SyncEntityName } from '../config/types';
import { upsertRows } from './upsertHelper';

export interface RawRecordInput {
  netsuiteId: string;
  raw: unknown;
}

/**
 * Generic pre-transform store: raw NetSuite JSON is written here before any
 * mapping/upsert into typed tables, so raw data survives even if a mapper
 * has a bug. Deliberately a new table (not the legacy `netsuite_query_results`)
 * so this module never races the legacy JS writers on the same rows.
 */
export class RawStoreRepository {
  private readonly table = 'netsuite_raw_records';

  constructor(private readonly db: Knex) {}

  async upsertMany(
    trx: Knex.Transaction,
    entity: SyncEntityName,
    records: RawRecordInput[],
    runId: string,
  ): Promise<void> {
    if (records.length === 0) return;

    const now = new Date();
    const rows = records.map((r) => ({
      entity,
      netsuite_id: r.netsuiteId,
      run_id: runId,
      raw_data: JSON.stringify(r.raw),
      fetched_at: now,
    }));

    await upsertRows(this.db, trx, this.table, rows, ['entity', 'netsuite_id']);
  }
}
