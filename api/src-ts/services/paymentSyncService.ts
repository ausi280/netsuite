import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapPayment } from '../mappers/paymentMapper';
import type { PaymentRow } from '../repositories/paymentRepository';
import type { SyncEntityName } from '../config/types';

export class PaymentSyncService extends BaseSyncService<RawNetSuiteRecord, PaymentRow> {
  readonly entityName: SyncEntityName = 'payment';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('transaction')
      .select('id', 'tranid', 'entity', 'trandate', 'total', 'status', 'currency', 'lastmodifieddate')
      .where(`type = 'CustPymt'`)
      .whereWatermark('lastmodifieddate', watermark)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): PaymentRow {
    return mapPayment(raw);
  }
}
