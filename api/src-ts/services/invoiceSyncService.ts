import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapInvoice } from '../mappers/invoiceMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { InvoiceRow } from '../repositories/invoiceRepository';
import type { SyncEntityName } from '../config/types';

export class InvoiceSyncService extends BaseSyncService<RawNetSuiteRecord, InvoiceRow> {
  readonly entityName: SyncEntityName = 'invoice';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('transaction')
      .select('id', 'tranid', 'entity', 'trandate', 'duedate', 'status', 'currency', 'total', 'foreigntotal', 'amountremaining', 'lastmodifieddate')
      .where(`type = 'CustInvc'`)
      .whereWatermark('lastmodifieddate', watermark, tieBreakId)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): InvoiceRow {
    return mapInvoice(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
