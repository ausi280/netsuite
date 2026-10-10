import type { Knex } from 'knex';
import type { ZammadHttpClient } from '../http/zammadHttpClient';
import type { SyncStateRepository } from '../repositories/syncStateRepository';
import type { RawStoreRepository } from '../repositories/rawStoreRepository';
import type { ZammadTicketRepository } from '../repositories/zammadTicketRepository';
import { mapZammadTicket } from '../mappers/zammadTicketMapper';
import { withDbRetry, type DbRetryConfig } from '../db/retry';
import type { EntitySyncService, SyncRunContext, SyncResult, SyncStatus } from './types';

// Same values as baseSyncService.ts's own DB_RETRY_CONFIG - a transient DB blip on one page
// shouldn't kill the whole sync run; retry that one page with a fresh transaction first.
const DB_RETRY_CONFIG: DbRetryConfig = {
  MAX_ATTEMPTS: 3,
  MIN_TIMEOUT_MS: 1000,
  MAX_TIMEOUT_MS: 15000,
};

/**
 * Zammad helpdesk tickets (https://tickets.cryoholdco.com), pulled every 15 minutes - a
 * live-support data source, not a NetSuite one, so this implements EntitySyncService directly
 * (same "doesn't fit the SuiteQL-shaped BaseSyncService" escape hatch as ReceivableSyncService)
 * rather than extending BaseSyncService. Unlike Receivable (a full-refresh point-in-time snapshot),
 * this DOES use an incremental watermark - a ticket update is an append/modify event worth
 * tracking over time, not a balance to recompute from scratch each run.
 *
 * Watermark is Zammad's own `updated_at` (ISO-8601), fed into the next run's search query as
 * `updated_at:>=<watermark>` - same overlap-buffer-minutes safety margin BaseSyncService uses, to
 * tolerate Zammad's search index lagging slightly behind a ticket's real last-modified time.
 */
export class ZammadTicketSyncService implements EntitySyncService {
  readonly entityName = 'zammadTicket' as const;

  constructor(
    private readonly db: Knex,
    private readonly http: ZammadHttpClient,
    private readonly syncState: SyncStateRepository,
    private readonly rawStore: RawStoreRepository,
    private readonly repo: ZammadTicketRepository,
    private readonly overlapBufferMinutes: number,
    private readonly pageSize: number,
  ) {}

  private buildQuery(watermark: Date | null): string {
    if (!watermark) return '*';
    const effective = new Date(watermark.getTime() - this.overlapBufferMinutes * 60_000);
    return `updated_at:>='${effective.toISOString()}'`;
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

    const state = await this.syncState.get(this.entityName);
    const query = this.buildQuery(state?.last_watermark ?? null);

    let fetched = 0;
    let upserted = 0;
    let failed = 0;
    let maxSeenTimestamp: Date | null = null;
    let lastError: string | undefined;

    try {
      let page = 1;
      // Stop once a page comes back shorter than requested - the usual "last page" signal, same
      // pagination-end convention NetSuiteHttpClient's own paging loop uses.
      while (true) {
        const tickets = await this.http.searchTickets({ query, page, perPage: this.pageSize });
        if (tickets.length === 0) break;

        fetched += tickets.length;

        try {
          await withDbRetry(
            () =>
              this.db.transaction(async (trx) => {
                await this.rawStore.upsertMany(
                  trx,
                  this.entityName,
                  tickets.map((t) => ({ netsuiteId: String(t.id), raw: t })),
                  ctx.runId,
                );
                const rows = tickets.map((t) => mapZammadTicket(t));
                upserted += await this.repo.upsertMany(trx, rows);
              }),
            DB_RETRY_CONFIG,
            ctx.logger,
          );
        } catch (error: any) {
          failed += tickets.length;
          lastError = error?.message ?? String(error);
          ctx.logger.error({ error: lastError }, 'Page failed to persist, stopping pagination');
          throw error;
        }

        for (const t of tickets) {
          if (!t.updated_at) continue;
          const ts = new Date(t.updated_at);
          if (!Number.isNaN(ts.getTime()) && (!maxSeenTimestamp || ts > maxSeenTimestamp)) {
            maxSeenTimestamp = ts;
          }
        }

        if (tickets.length < this.pageSize) break;
        page += 1;
      }
    } catch (error: any) {
      if (!lastError) lastError = error?.message ?? String(error);
    }

    const status: SyncStatus = lastError ? (fetched > 0 ? 'partial' : 'failed') : 'success';
    await this.syncState.completeRun(this.entityName, { status, watermark: maxSeenTimestamp, error: lastError ?? null });

    return this.toResult(ctx, status, fetched, upserted, failed, lastError);
  }

  private async runDryRun(ctx: SyncRunContext): Promise<SyncResult> {
    const state = await this.syncState.get(this.entityName);
    const query = this.buildQuery(state?.last_watermark ?? null);
    ctx.logger.info({ query }, 'Dry run: fetching and mapping without persisting');

    let fetched = 0;
    let mapErrors = 0;
    let page = 1;

    while (true) {
      const tickets = await this.http.searchTickets({ query, page, perPage: this.pageSize });
      if (tickets.length === 0) break;

      fetched += tickets.length;
      for (const t of tickets) {
        try {
          mapZammadTicket(t);
        } catch (error: any) {
          mapErrors += 1;
          ctx.logger.warn({ id: t.id, error: error?.message ?? String(error) }, 'Dry run: mapper failed for record');
        }
      }

      if (tickets.length < this.pageSize) break;
      page += 1;
    }

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
