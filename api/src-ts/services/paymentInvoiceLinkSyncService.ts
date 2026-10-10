import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import type { PaymentInvoiceLinkRow } from '../repositories/paymentInvoiceLinkRepository';
import type { SyncEntityName } from '../config/types';

/**
 * NetSuite's own native payment-to-invoice application relationship (nexttransactionlink,
 * linktype='Payment') - NOT the same as netsuite_payments.custbody_cryo_associated_invoices_item, a
 * bespoke custom field this org also stamps on SOME payments but not all. Confirmed live against
 * production: of 10,646 payment-application links since 2026-09-01, 6,125 (~58%) have no value in
 * that custom field at all despite being genuinely, fully applied to their invoice in NetSuite's own
 * linking table - e.g. payment PAGCRYOC-7707 (id 472431) is natively linked to invoice
 * FV-CRYOMEX-9068 (id 476648, NetSuite status "Pagado por completo") with
 * custbody_cryo_associated_invoices_item left null. The custom field alone silently undercounts
 * "which invoices got paid, and when" for cobranzaCommissionsRepository.ts, which now checks both.
 *
 * One (payment_id, invoice_id) row per application - a payment applying to more than one invoice is
 * rare (confirmed live: 11 of 10,646 since 2026-09-01, always exactly 2), so this is a proper
 * one-to-many table rather than a single "primary invoice" column on the payment itself.
 *
 * Incremental like every other entity here, watermarked on the PAYMENT's own lastmodifieddate (the
 * link itself carries no timestamp) - a settled payment's application rarely changes after the
 * fact, but re-fetching on any edit to the payment keeps this in sync with reality regardless.
 */
export class PaymentInvoiceLinkSyncService extends BaseSyncService<RawNetSuiteRecord, PaymentInvoiceLinkRow> {
  readonly entityName: SyncEntityName = 'paymentInvoiceLink';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('nexttransactionlink L INNER JOIN transaction T ON T.id = L.nextdoc', 'T.id')
      .select('T.id', 'T.lastmodifieddate', 'L.previousdoc as invoice_id')
      .where(`L.linktype = 'Payment'`)
      .where(`T.type = 'CustPymt'`)
      .whereWatermark('T.lastmodifieddate', watermark, tieBreakId)
      .orderBy('T.lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): PaymentInvoiceLinkRow {
    return {
      payment_id: String(raw.id),
      invoice_id: String(raw.invoice_id),
    };
  }
}
