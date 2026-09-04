import type { Knex } from '../db/connection';
import type { NetSuiteHttpClient } from '../http/netsuiteHttpClient';
import type { SyncStateRepository } from '../repositories/syncStateRepository';
import type { RawStoreRepository } from '../repositories/rawStoreRepository';
import type { VendorBillPaymentRepository } from '../repositories/vendorBillPaymentRepository';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { toStringOrNull } from '../mappers/utils';
import type { EntitySyncService, SyncRunContext, SyncResult, SyncStatus } from './types';
import type { RawNetSuiteRecord } from './baseSyncService';

/**
 * NetSuite's NextTransactionLink has no lastmodifieddate to watermark on, so - like receivables -
 * this does a full pass every run then prunes rows the run didn't touch, rather than incremental
 * upserts. Scoped to linktype='Payment' where the previous doc is a VendBill, so this never picks
 * up unrelated application links (e.g. customer payment-to-invoice).
 */
export class VendorBillPaymentSyncService implements EntitySyncService {
  readonly entityName = 'vendorBillPayment' as const;

  constructor(
    private readonly db: Knex,
    private readonly http: NetSuiteHttpClient,
    private readonly syncState: SyncStateRepository,
    private readonly rawStore: RawStoreRepository,
    private readonly repo: VendorBillPaymentRepository,
  ) {}

  private buildQuery(): string {
    return SuiteQlQueryBuilder.from('NextTransactionLink ntl JOIN transaction tprev ON tprev.id = ntl.previousdoc', 'ntl.previousdoc')
      .select('ntl.previousdoc', 'ntl.nextdoc', 'ntl.linktype')
      .where(`ntl.linktype = 'Payment'`)
      .where(`tprev.type = 'VendBill'`)
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
      await this.http.executeSuiteQL<RawNetSuiteRecord & { previousdoc: unknown; nextdoc: unknown; linktype: unknown }>(
        this.buildQuery(),
        {
          pageCallback: async (page) => {
            if (page.length === 0) return;
            fetched += page.length;

            try {
              await this.db.transaction(async (trx) => {
                await this.rawStore.upsertMany(
                  trx,
                  this.entityName,
                  page.map((raw) => ({ netsuiteId: `${raw.previousdoc}-${raw.nextdoc}`, raw })),
                  ctx.runId,
                );
                const rows = page.map((raw) => ({
                  previousdoc: String(raw.previousdoc),
                  nextdoc: String(raw.nextdoc),
                  linktype: toStringOrNull(raw.linktype),
                  computed_at: ctx.startedAt,
                }));
                upserted += await this.repo.upsertMany(trx, rows);
              });
            } catch (error: any) {
              failed += page.length;
              lastError = error?.message ?? String(error);
              ctx.logger.error({ error: lastError }, 'Page failed to persist, stopping pagination');
              throw error;
            }
          },
        },
      );
    } catch (error: any) {
      if (!lastError) lastError = error?.message ?? String(error);
    }

    if (fetched === 0 && lastError) {
      await this.syncState.completeRun(this.entityName, { status: 'failed', watermark: null, error: lastError });
      return this.toResult(ctx, 'failed', fetched, upserted, failed, lastError);
    }

    if (!lastError) {
      const pruned = await this.db.transaction((trx) => this.repo.pruneStale(trx, ctx.startedAt));
      ctx.logger.info({ pruned }, 'Pruned stale vendor bill/payment links');
    }

    const status: SyncStatus = lastError ? 'partial' : 'success';
    await this.syncState.completeRun(this.entityName, { status, watermark: null, error: lastError ?? null });

    return this.toResult(ctx, status, fetched, upserted, failed, lastError);
  }

  private async runDryRun(ctx: SyncRunContext): Promise<SyncResult> {
    const query = this.buildQuery();
    ctx.logger.info({ query }, 'Dry run: fetching without persisting');

    let fetched = 0;

    await this.http.executeSuiteQL<RawNetSuiteRecord>(query, {
      pageCallback: async (page) => {
        fetched += page.length;
      },
    });

    ctx.logger.info({ fetched }, 'Dry run complete');
    return this.toResult(ctx, 'success', fetched, 0, 0);
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
