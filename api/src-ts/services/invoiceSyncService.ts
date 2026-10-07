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
      .select(
        'id',
        'tranid',
        'entity',
        'trandate',
        'duedate',
        'status',
        'currency',
        'total',
        'foreigntotal',
        // 'amountremaining' is NOT a valid SuiteQL identifier on this table (confirmed live against
        // both sandbox and production - "Unknown identifier 'amountremaining'") - this field was
        // never actually exercised before now since INVOICE sync has been disabled since this
        // service was first written. InvoiceRow.amountremaining stays in the schema/type (still
        // nullable) but will always map to null via mapInvoice's toNumber(undefined).
        'lastmodifieddate',
        'custbody_cryo_numcontrato',
        'custbody_cryo_cobrador',
        'custbody_cryo_fecha_emision',
      )
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
