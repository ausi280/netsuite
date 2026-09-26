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
      .select(
        'id', 'entityid', 'companyname', 'email', 'phone', 'isinactive', 'datecreated', 'lastmodifieddate',
        'custentitycustentity_cryo_telefono1', 'custentitycustentity_cryo_telefono2', 'custentity_cryo_telefono3',
        'custentity_cryo_telefono4', 'custentity3', 'custentity_cryo_telefono6', 'custentity_cryo_telefono7',
        'custentity_cryo_telefono8', 'custentity_cryo_telefono9', 'custentity_cryo_telefono10',
      )
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
