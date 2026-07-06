import type { Knex } from 'knex';
import type { SyncEntityName } from '../config/types';

export type RunStatus = 'running' | 'success' | 'partial' | 'failed';

export interface SyncStateRow {
  id: number;
  entity: string;
  last_watermark: Date | null;
  last_run_id: string | null;
  last_run_status: RunStatus | null;
  last_run_started_at: Date | null;
  last_run_completed_at: Date | null;
  last_run_error: string | null;
  consecutive_failures: number;
}

/**
 * Persists per-entity incremental-sync watermarks and provides the
 * DB-level run lock (belt-and-suspenders with the in-process guard in
 * scheduler/registerJobs.ts) that stops two runs of the same entity
 * overlapping.
 */
export class SyncStateRepository {
  private readonly table = 'netsuite_sync_state';

  constructor(private readonly db: Knex) {}

  async get(entity: SyncEntityName): Promise<SyncStateRow | undefined> {
    return this.db<SyncStateRow>(this.table).where({ entity }).first();
  }

  private async ensure(entity: SyncEntityName): Promise<void> {
    const existing = await this.get(entity);
    if (!existing) {
      await this.db(this.table).insert({ entity, consecutive_failures: 0 });
    }
  }

  /** Atomically claims the run; returns false when another run is already in progress. */
  async tryStartRun(entity: SyncEntityName, runId: string): Promise<boolean> {
    await this.ensure(entity);

    const affected = await this.db(this.table)
      .where({ entity })
      .where((qb) => {
        qb.whereNull('last_run_status').orWhereNot('last_run_status', 'running');
      })
      .update({
        last_run_id: runId,
        last_run_status: 'running',
        last_run_started_at: new Date(),
        updated_at: new Date(),
      });

    return affected === 1;
  }

  async completeRun(
    entity: SyncEntityName,
    params: { status: RunStatus; watermark: Date | null; error?: string | null },
  ): Promise<void> {
    const current = await this.get(entity);
    const consecutiveFailures = params.status === 'failed' ? (current?.consecutive_failures ?? 0) + 1 : 0;

    await this.db(this.table)
      .where({ entity })
      .update({
        last_run_status: params.status,
        last_run_completed_at: new Date(),
        last_run_error: params.error ?? null,
        consecutive_failures: consecutiveFailures,
        ...(params.watermark ? { last_watermark: params.watermark } : {}),
        updated_at: new Date(),
      });
  }
}
