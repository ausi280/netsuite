import type { Knex } from '../db/connection';
import type { NetSuiteHttpClient } from '../http/netsuiteHttpClient';
import type { SyncStateRepository } from '../repositories/syncStateRepository';
import type { RawStoreRepository } from '../repositories/rawStoreRepository';
import type { SyncEntityName } from '../config/types';
import type { EntitySyncService, SyncRunContext, SyncResult, SyncStatus } from './types';
import { withDbRetry, type DbRetryConfig } from '../db/retry';

// A page-write hitting "Can't rollback transaction" or a dropped connection
// shouldn't kill a multi-hour sync run outright — retry that one page with
// a fresh transaction before giving up on it.
const DB_RETRY_CONFIG: DbRetryConfig = {
  MAX_ATTEMPTS: 3,
  MIN_TIMEOUT_MS: 1000,
  MAX_TIMEOUT_MS: 15000,
};

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

  protected abstract buildQuery(watermark: Date | null, tieBreakId?: string | null): string;
  protected abstract mapRow(raw: TRaw): TRow;

  protected extractTimestamp(raw: TRaw): Date | null {
    const value = raw.lastmodifieddate;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /**
   * Finds the max NetSuite internal id seen in a page, used as the
   * continuation cursor once we can no longer trust the timestamp (see
   * queryBuilder.ts's whereWatermark doc for why). Scans the whole page
   * rather than trusting page order, since a page hit while still on
   * lastmodified-ordering (i.e. the very first time the cap is hit) isn't
   * guaranteed id-ordered.
   */
  private findMaxId(lastPage: TRaw[]): string | null {
    let maxId: string | null = null;
    let maxIdNum = -Infinity;

    for (const raw of lastPage) {
      const idNum = Number(raw.id);
      const isGreater = Number.isNaN(idNum) || Number.isNaN(maxIdNum) ? String(raw.id) > String(maxId) : idNum > maxIdNum;
      if (maxId === null || isGreater) {
        maxId = String(raw.id);
        maxIdNum = idNum;
      }
    }

    return maxId;
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
    // The first page to hit the offset cap is still ordered by (usually)
    // lastmodified, not id — record ids are scattered essentially randomly
    // relative to that order (verified in production), so "max id in that
    // page" is not a safe boundary: a single high-id/old-lastmodified
    // outlier can inflate it and cause later id-cursor rounds to silently
    // skip every not-yet-fetched record whose id falls below it. Once we
    // switch to id-ordering the risk is gone (ascending id order guarantees
    // the last page holds the true max id of everything fetched so far),
    // so only the very first switch needs to restart from id 0 instead of
    // trusting the page it was triggered from.
    let idModeActive = false;

    try {
      await this.http.executeSuiteQL<TRaw>(query, {
        pageCallback: async (page) => {
          if (page.length === 0) return;
          fetched += page.length;
          ctx.logger.info({ pageSize: page.length, fetchedSoFar: fetched }, 'Page fetched from NetSuite, starting DB write');
          const dbWriteStart = Date.now();

          try {
            const upsertedThisPage = await withDbRetry(
              () =>
                this.db.transaction(async (trx) => {
                  await this.rawStore.upsertMany(
                    trx,
                    this.entityName,
                    page.map((raw) => ({ netsuiteId: String(raw.id), raw })),
                    ctx.runId,
                  );
                  const rows = page.map((raw) => this.mapRow(raw));
                  return this.repo.upsertMany(trx, rows);
                }),
              DB_RETRY_CONFIG,
              ctx.logger,
            );
            upserted += upsertedThisPage;
            ctx.logger.info(
              { pageSize: page.length, upsertedSoFar: upserted, dbWriteMs: Date.now() - dbWriteStart },
              'Page persisted',
            );

            for (const raw of page) {
              const ts = this.extractTimestamp(raw);
              if (ts && (!maxSeenTimestamp || ts > maxSeenTimestamp)) {
                maxSeenTimestamp = ts;
              }
            }
          } catch (error: any) {
            failed += page.length;
            lastError = error?.message ?? String(error);
            ctx.logger.error({ error: lastError }, 'Page failed to persist after retries, stopping pagination');
            throw error; // stops the http client's pagination loop
          }
        },
        continueBeyondOffsetCap: ({ lastPage, fetchedSoFar, totalResults }) => {
          if (!idModeActive) {
            idModeActive = true;
            ctx.logger.warn(
              { fetchedSoFar, totalResults },
              'NetSuite pagination cap (100k) reached on a lastmodified-ordered page; switching to a full id-ordered pass from the start of the watermark-scoped range (an id derived from this page is not a safe boundary)',
            );
            return this.buildQuery(effectiveWatermark, '0');
          }

          const maxId = this.findMaxId(lastPage);
          if (!maxId) {
            ctx.logger.error(
              { fetchedSoFar, totalResults },
              'Hit NetSuite pagination cap (100k) but could not determine a continuation id from the last page; stopping here',
            );
            return null;
          }
          ctx.logger.warn(
            { fetchedSoFar, totalResults, tieBreakId: maxId },
            'NetSuite pagination cap (100k) reached; continuing by id cursor (watermark pinned) since timestamp text can lose precision',
          );
          return this.buildQuery(effectiveWatermark, maxId);
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
    let idModeActive = false;

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
      continueBeyondOffsetCap: ({ lastPage, fetchedSoFar, totalResults }) => {
        if (!idModeActive) {
          idModeActive = true;
          ctx.logger.warn({ fetchedSoFar, totalResults }, 'Dry run: pagination cap reached on a lastmodified-ordered page; switching to id-ordered pass from the start');
          return this.buildQuery(effectiveWatermark, '0');
        }
        const maxId = this.findMaxId(lastPage);
        if (!maxId) return null;
        ctx.logger.warn({ fetchedSoFar, totalResults, tieBreakId: maxId }, 'Dry run: pagination cap reached, continuing by id cursor');
        return this.buildQuery(effectiveWatermark, maxId);
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
