import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapPayment } from '../mappers/paymentMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { PaymentRow } from '../repositories/paymentRepository';
import type { SyncEntityName } from '../config/types';

export class PaymentSyncService extends BaseSyncService<RawNetSuiteRecord, PaymentRow> {
  readonly entityName: SyncEntityName = 'payment';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('transaction')
      .select('id', 'tranid', 'entity', 'trandate', 'total', 'status', 'currency', 'lastmodifieddate')
      .where(`type = 'CustPymt'`)
      .whereWatermark('lastmodifieddate', watermark, tieBreakId)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): PaymentRow {
    return mapPayment(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
