import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapCustomer } from '../mappers/customerMapper';
import type { CustomerRow } from '../repositories/customerRepository';
import type { SyncEntityName } from '../config/types';

export class CustomerSyncService extends BaseSyncService<RawNetSuiteRecord, CustomerRow> {
  readonly entityName: SyncEntityName = 'customer';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('customer')
      .select('id', 'entityid', 'companyname', 'email', 'phone', 'isinactive', 'datecreated', 'lastmodifieddate')
      .whereWatermark('lastmodifieddate', watermark)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): CustomerRow {
    return mapCustomer(raw);
  }
}
