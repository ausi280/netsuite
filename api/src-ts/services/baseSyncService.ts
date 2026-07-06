import type { Knex } from '../db/connection';
import type { NetSuiteHttpClient } from '../http/netsuiteHttpClient';
import type { SyncStateRepository } from '../repositories/syncStateRepository';
import type { RawStoreRepository } from '../repositories/rawStoreRepository';
import type { SyncEntityName } from '../config/types';
import type { EntitySyncService, SyncRunContext, SyncResult, SyncStatus } from './types';

export interface RawNetSuiteRecord {
  id: string | number;
  [key: string]: any;
}

export interface EntityRepository<TRow> {
  upsertMany(trx: Knex.Transaction, rows: TRow[]): Promise<number>;
}

/**
 * Shared incremental-sync algorithm: claim the run (DB-level lock), compute
 * an overlap-buffered watermark, page through SuiteQL results, and per page
 * write raw JSON then the typed upsert inside one transaction. A page that
 * fails to persist stops pagination (rather than skipping ahead) so the
 * watermark never advances past a gap. Subclasses only provide the SuiteQL
 * query, the raw->row mapping, and (when the entity's timestamp field isn't
 * `lastmodifieddate`) how to read a record's timestamp.
 */
export abstract class BaseSyncService<TRaw extends RawNetSuiteRecord, TRow> implements EntitySyncService {
  abstract readonly entityName: SyncEntityName;

  constructor(
    protected readonly db: Knex,
    protected readonly http: NetSuiteHttpClient,
    protected readonly syncState: SyncStateRepository,
    protected readonly rawStore: RawStoreRepository,
    protected readonly repo: EntityRepository<TRow>,
    protected readonly overlapBufferMinutes: number,
  ) {}

  protected abstract buildQuery(watermark: Date | null): string;
  protected abstract mapRow(raw: TRaw): TRow;

  protected extractTimestamp(raw: TRaw): Date | null {
    const value = raw.lastmodifieddate;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async run(ctx: SyncRunContext): Promise<SyncResult> {
    if (ctx.dryRun) {
      return this.runDryRun(ctx);
    }

    const state = await this.syncState.get(this.entityName);
    const claimed = await this.syncState.tryStartRun(this.entityName, ctx.runId);

    if (!claimed) {
      ctx.logger.warn('Previous run still in progress, skipping this run');
      return this.toResult(ctx, 'skipped', 0, 0, 0, null);
    }

    const effectiveWatermark = this.computeEffectiveWatermark(state?.last_watermark ?? null);
    const query = this.buildQuery(effectiveWatermark);
    ctx.logger.info({ query, effectiveWatermark }, 'Starting entity sync');

    let fetched = 0;
    let upserted = 0;
    let failed = 0;
    let maxSeenTimestamp: Date | null = null;
    let lastError: string | undefined;

    try {
      await this.http.executeSuiteQL<TRaw>(query, {
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
              const rows = page.map((raw) => this.mapRow(raw));
              upserted += await this.repo.upsertMany(trx, rows);
            });

            for (const raw of page) {
              const ts = this.extractTimestamp(raw);
              if (ts && (!maxSeenTimestamp || ts > maxSeenTimestamp)) {
                maxSeenTimestamp = ts;
              }
            }
          } catch (error: any) {
            failed += page.length;
            lastError = error?.message ?? String(error);
            ctx.logger.error({ error: lastError }, 'Page failed to persist, stopping pagination');
            throw error; // stops the http client's pagination loop
          }
        },
      });
    } catch (error: any) {
      if (!lastError) lastError = error?.message ?? String(error);

      if (fetched === 0) {
        await this.syncState.completeRun(this.entityName, { status: 'failed', watermark: null, error: lastError });
        return this.toResult(ctx, 'failed', fetched, upserted, failed, null, lastError);
      }
    }

    const status: SyncStatus = lastError ? 'partial' : 'success';
    await this.syncState.completeRun(this.entityName, {
      status,
      watermark: maxSeenTimestamp,
      error: lastError ?? null,
    });

    return this.toResult(ctx, status, fetched, upserted, failed, maxSeenTimestamp, lastError);
  }

  /** Fetches and exercises the mapper for validation, without touching the DB or sync state. */
  private async runDryRun(ctx: SyncRunContext): Promise<SyncResult> {
    const state = await this.syncState.get(this.entityName);
    const effectiveWatermark = this.computeEffectiveWatermark(state?.last_watermark ?? null);
    const query = this.buildQuery(effectiveWatermark);
    ctx.logger.info({ query, effectiveWatermark }, 'Dry run: fetching and mapping without persisting');

    let fetched = 0;
    let mapErrors = 0;

    await this.http.executeSuiteQL<TRaw>(query, {
      pageCallback: async (page) => {
        fetched += page.length;
        for (const raw of page) {
          try {
            this.mapRow(raw);
          } catch (error: any) {
            mapErrors += 1;
            ctx.logger.warn({ id: raw.id, error: error?.message ?? String(error) }, 'Dry run: mapper failed for record');
          }
        }
      },
    });

    ctx.logger.info({ fetched, mapErrors }, 'Dry run complete');
    return this.toResult(ctx, mapErrors > 0 ? 'partial' : 'success', fetched, 0, mapErrors, null);
  }

  private computeEffectiveWatermark(lastWatermark: Date | null): Date | null {
    if (!lastWatermark) return null;
    return new Date(lastWatermark.getTime() - this.overlapBufferMinutes * 60_000);
  }

  private toResult(
    ctx: SyncRunContext,
    status: SyncStatus,
    fetched: number,
    upserted: number,
    failed: number,
    watermarkAdvancedTo: Date | null,
    error?: string,
  ): SyncResult {
    return {
      entity: this.entityName,
      runId: ctx.runId,
      status,
      fetched,
      upserted,
      failed,
      watermarkAdvancedTo,
      ...(error ? { error } : {}),
    };
  }
}
