import type { Knex } from '../db/connection';
import type { NetSuiteHttpClient } from '../http/netsuiteHttpClient';
import type { SyncStateRepository } from '../repositories/syncStateRepository';
import type { EntitySyncService, SyncRunContext, SyncResult, SyncStatus } from './types';

// Same contract custom record contractEditRepository.ts PATCHes.
const CONTRACT_RECORD_TYPE = 'customrecord1184';
const CONTRACT_ID_EXPR = `JSON_VALUE(payloadRequest, '$.contractId')`;
// Employee 448054 "POR DEFINIR" - the placeholder vendedor already used on other contracts. Sent
// only when NetSuite rejects the PATCH because the contract has no vendedor (mandatory field).
const POR_DEFINIR_VENDEDOR_ID = '448054';
const MISSING_VENDEDOR_ERROR = /Introduzca valores para:.*Vendedor|enter value\(s\) for:.*Vendedor/i;
// Every domiciliación is charged through MercadoPago - "Terminación tarjeta" (free text) records
// that instead of the card's last digits. NOTE: as of 2026-10-22 this field has "Store Value" off
// in NetSuite (customfield isstored = F), so NetSuite discards it until an admin turns that on.
const CONTRACT_PAGO_AUTOMATICO_VALUES = {
  custrecord_cryo_mx_pagoautomatico: true,
  custrecord_cryo_mx_terminacion_tarjeta: 'MP',
};

/** app_payments.domiciliacion_synced values - 'pending' is set by the separate `payment` project
 * when a payment enrolls the contract in domiciliación (automatic card charge). */
export const DOMICILIACION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  /** No contractId in payloadRequest - nothing to push, and retrying can never fix it. */
  ERROR: 'error',
} as const;

/**
 * The one sync that writes TO NetSuite instead of reading from it: every app_payments row flagged
 * domiciliacion_synced = 'pending' sets its contract's custrecord_cryo_mx_pagoautomatico ("pago
 * automático") checkbox to true and "Terminación tarjeta" to MP in NetSuite, mirrors the checkbox into
 * netsuite_contracts, then marks the
 * payment rows 'completed'. Grouped by contract so several pending payments for one contract cost
 * a single write (contractPagoAutomaticoRestlet.js when deployed, else a REST PATCH). A contract whose
 * write fails keeps its rows 'pending' and is retried next run.
 */
export class DomiciliacionPushService implements EntitySyncService {
  readonly entityName = 'domiciliacion' as const;

  constructor(
    private readonly db: Knex,
    private readonly http: NetSuiteHttpClient,
    private readonly syncState: SyncStateRepository,
    /** contractPagoAutomaticoRestlet.js ids - preferred over the REST PATCH, which NetSuite rejects
     * ("Introduzca valores para: Vendedor") for every contract with no custrecord_cryo_vendedor. */
    private readonly restlet: { SCRIPT: string; DEPLOY: string } | null,
  ) {}

  /** Writes CONTRACT_PAGO_AUTOMATICO_VALUES to one contract - throws with NetSuite's message on
   * failure. Returns the vendedor it had to fill in (see POR_DEFINIR_VENDEDOR_ID), or null. Always
   * written, even when the contract is already pago automático, so it still gets "MP". Exported for
   * one-off re-pushes of contracts whose payments are already 'completed'. */
  async setPagoAutomatico(contractId: string): Promise<string | null> {
    if (!this.restlet) {
      const body = { ...CONTRACT_PAGO_AUTOMATICO_VALUES };
      try {
        await this.http.patchRecord(CONTRACT_RECORD_TYPE, contractId, body);
        return null;
      } catch (error: any) {
        if (!MISSING_VENDEDOR_ERROR.test(String(error?.message))) throw error;
        // Vendedor is mandatory and this contract has none - fill it with "POR DEFINIR" and retry once.
        await this.http.patchRecord(CONTRACT_RECORD_TYPE, contractId, { ...body, custrecord_cryo_vendedor: { id: POR_DEFINIR_VENDEDOR_ID } });
        return POR_DEFINIR_VENDEDOR_ID;
      }
    }
    const response = await this.http.postRestlet<{ success: boolean; message?: string; results?: Array<{ id: string; ok: boolean; message?: string }> }>(
      this.restlet.SCRIPT,
      this.restlet.DEPLOY,
      { contractIds: [contractId] },
    );
    const result = response.results?.find((r) => r.id === contractId);
    if (!result?.ok) {
      throw new Error(result?.message ?? response.message ?? 'RESTlet did not confirm the update');
    }
    return null;
  }

  /** Pending payment ids grouped by NetSuite contract id ('' = payment without a contractId). */
  private async loadPending(): Promise<Map<string, number[]>> {
    const rows: Array<{ id: number; contract_id: string | null }> = await this.db('app_payments')
      .where('domiciliacion_synced', DOMICILIACION_STATUS.PENDING)
      .select('id', this.db.raw(`${CONTRACT_ID_EXPR} as contract_id`));

    const byContract = new Map<string, number[]>();
    for (const row of rows) {
      const key = row.contract_id ? String(row.contract_id).trim() : '';
      byContract.set(key, [...(byContract.get(key) ?? []), row.id]);
    }
    return byContract;
  }

  private async markPayments(paymentIds: number[], status: string): Promise<void> {
    await this.db('app_payments')
      .whereIn('id', paymentIds)
      .andWhere('domiciliacion_synced', DOMICILIACION_STATUS.PENDING)
      .update({ domiciliacion_synced: status, updated_at: new Date() });
  }

  async run(ctx: SyncRunContext): Promise<SyncResult> {
    const pending = await this.loadPending();
    const paymentCount = [...pending.values()].reduce((sum, ids) => sum + ids.length, 0);

    if (ctx.dryRun) {
      ctx.logger.info(
        { payments: paymentCount, contracts: [...pending.keys()] },
        'Dry run: would set custrecord_cryo_mx_pagoautomatico = true and custrecord_cryo_mx_terminacion_tarjeta = MP on these contracts',
      );
      return this.toResult(ctx, 'success', paymentCount, 0, 0);
    }

    const claimed = await this.syncState.tryStartRun(this.entityName, ctx.runId);
    if (!claimed) {
      ctx.logger.warn('Previous run still in progress, skipping this run');
      return this.toResult(ctx, 'skipped', 0, 0, 0);
    }

    let pushed = 0;
    let failed = 0;
    let lastError: string | undefined;

    for (const [contractId, paymentIds] of pending) {
      if (!contractId) {
        ctx.logger.warn({ paymentIds }, 'Pending domiciliación payment has no contractId - marking error');
        await this.markPayments(paymentIds, DOMICILIACION_STATUS.ERROR);
        failed += paymentIds.length;
        continue;
      }

      try {
        const filledVendedor = await this.setPagoAutomatico(contractId);
        // Mirror locally so reports show it before the next contract sync (synced checkboxes are 'T'/'F').
        await this.db('netsuite_contracts')
          .where('netsuite_id', contractId)
          .update({ custrecord_cryo_mx_pagoautomatico: 'T', ...(filledVendedor ? { custrecord_cryo_vendedor: filledVendedor } : {}) });
        await this.markPayments(paymentIds, DOMICILIACION_STATUS.COMPLETED);
        pushed += paymentIds.length;
        ctx.logger.info({ contractId, paymentIds, filledVendedor }, 'Contract marked pago automático');
      } catch (error: any) {
        failed += paymentIds.length;
        lastError = error?.message ?? String(error);
        ctx.logger.error({ contractId, paymentIds, error: lastError }, 'Failed to mark contract pago automático - left pending');
      }
    }

    const status: SyncStatus = failed === 0 ? 'success' : pushed > 0 ? 'partial' : 'failed';
    await this.syncState.completeRun(this.entityName, { status, watermark: null, error: lastError ?? null });
    return this.toResult(ctx, status, paymentCount, pushed, failed, lastError);
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
