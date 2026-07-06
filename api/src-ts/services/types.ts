import type { Logger } from '../logger';
import type { SyncEntityName } from '../config/types';

export interface SyncRunContext {
  runId: string;
  entity: SyncEntityName;
  startedAt: Date;
  logger: Logger;
  /** Fetch + map only, skip persistence and sync-state mutation. Used by the CLI to validate a mapper before enabling writes. */
  dryRun?: boolean;
}

export type SyncStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface SyncResult {
  entity: SyncEntityName;
  runId: string;
  fetched: number;
  upserted: number;
  failed: number;
  watermarkAdvancedTo: Date | null;
  status: SyncStatus;
  error?: string;
}

export interface EntitySyncService {
  readonly entityName: SyncEntityName;
  run(ctx: SyncRunContext): Promise<SyncResult>;
}
