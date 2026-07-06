import type { Knex } from '../db/connection';
import type { NetSuiteHttpClient } from '../http/netsuiteHttpClient';
import type { SyncStateRepository } from '../repositories/syncStateRepository';
import type { RawStoreRepository } from '../repositories/rawStoreRepository';
import type { ReceivableRepository } from '../repositories/receivableRepository';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapReceivable } from '../mappers/receivableMapper';
import type { EntitySyncService, SyncRunContext, SyncResult, SyncStatus } from './types';
import type { RawNetSuiteRecord } from './baseSyncService';

/**
 * Receivables are a derived, point-in-time fact (open invoice balances),
 * not an append-only history, so this does NOT use the shared
 * BaseSyncService watermark algorithm: every run does a full open-balance
 * query, then prunes rows this run didn't touch so closed invoices
 * disappear from the table.
 */
export class ReceivableSyncService implements EntitySyncService {
  readonly entityName = 'receivable' as const;

  constructor(
    private readonly db: Knex,
    private readonly http: NetSuiteHttpClient,
    private readonly syncState: SyncStateRepository,
    private readonly rawStore: RawStoreRepository,
    private readonly repo: ReceivableRepository,
  ) {}

  private buildQuery(): string {
    return SuiteQlQueryBuilder.from('transaction')
      .select('id', 'entity', 'amountremaining', 'currency', 'trandate', 'duedate')
      .where(`type = 'CustInvc'`)
      .where('amountremaining <> 0')
      .orderBy('id', 'ASC')
      .build();
  }

  async run(ctx: SyncRunContext): Promise<SyncResult> {
    if (ctx.dryRun) {
      return this.runDryRun(ctx);
    }

    const claimed = await this.syncState.tryStartRun(this.entityName, ctx.runId);
    if (!claimed) {
      ctx.logger.warn('Previous run still in progress, skipping this run');
      return this.toResult(ctx, 'skipped', 0, 0, 0);
    }

    let fetched = 0;
    let upserted = 0;
    let failed = 0;
    let lastError: string | undefined;

    try {
      await this.http.executeSuiteQL<RawNetSuiteRecord>(this.buildQuery(), {
        pageCallback: async (page) => {
          if (page.length === 0) return;
          fetched += page.length;

          try {
            await this.db.transaction(async (trx) => {
              await this.rawStore.upsertMany(
                trx,
                this.entityName,
                page.map((raw) => ({ netsuiteId: String(raw.id), raw })),
                ctx.runId,
              );
              const rows = page.map((raw) => mapReceivable(raw, ctx.startedAt));
              upserted += await this.repo.upsertMany(trx, rows);
            });
          } catch (error: any) {
            failed += page.length;
            lastError = error?.message ?? String(error);
            ctx.logger.error({ error: lastError }, 'Page failed to persist, stopping pagination');
            throw error;
          }
        },
      });
    } catch (error: any) {
      if (!lastError) lastError = error?.message ?? String(error);
    }

    if (fetched === 0 && lastError) {
      await this.syncState.completeRun(this.entityName, { status: 'failed', watermark: null, error: lastError });
      return this.toResult(ctx, 'failed', fetched, upserted, failed, lastError);
    }

    // Only prune stale (closed) invoices when the run completed without
    // errors — a partial run must not delete rows it never got to revisit.
    if (!lastError) {
      const pruned = await this.db.transaction((trx) => this.repo.pruneStale(trx, ctx.startedAt));
      ctx.logger.info({ pruned }, 'Pruned stale receivables');
    }

    const status: SyncStatus = lastError ? 'partial' : 'success';
    await this.syncState.completeRun(this.entityName, { status, watermark: null, error: lastError ?? null });

    return this.toResult(ctx, status, fetched, upserted, failed, lastError);
  }

  private async runDryRun(ctx: SyncRunContext): Promise<SyncResult> {
    const query = this.buildQuery();
    ctx.logger.info({ query }, 'Dry run: fetching and mapping without persisting');

    let fetched = 0;
    let mapErrors = 0;

    await this.http.executeSuiteQL<RawNetSuiteRecord>(query, {
      pageCallback: async (page) => {
        fetched += page.length;
        for (const raw of page) {
          try {
            mapReceivable(raw, ctx.startedAt);
          } catch (error: any) {
            mapErrors += 1;
            ctx.logger.warn({ id: raw.id, error: error?.message ?? String(error) }, 'Dry run: mapper failed for record');
          }
        }
      },
    });

    ctx.logger.info({ fetched, mapErrors }, 'Dry run complete');
    return this.toResult(ctx, mapErrors > 0 ? 'partial' : 'success', fetched, 0, mapErrors);
  }

  private toResult(
    ctx: SyncRunContext,
    status: SyncStatus,
    fetched: number,
    upserted: number,
    failed: number,
    error?: string,
  ): SyncResult {
    return {
      entity: this.entityName,
      runId: ctx.runId,
      status,
      fetched,
      upserted,
      failed,
      watermarkAdvancedTo: null,
      ...(error ? { error } : {}),
    };
  }
}
