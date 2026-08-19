import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapCustomer } from '../mappers/customerMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { CustomerRow } from '../repositories/customerRepository';
import type { SyncEntityName } from '../config/types';

export class CustomerSyncService extends BaseSyncService<RawNetSuiteRecord, CustomerRow> {
  readonly entityName: SyncEntityName = 'customer';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('customer')
      .select('id', 'entityid', 'companyname', 'email', 'phone', 'isinactive', 'datecreated', 'lastmodifieddate')
      .whereWatermark('lastmodifieddate', watermark, tieBreakId)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): CustomerRow {
    return mapCustomer(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
