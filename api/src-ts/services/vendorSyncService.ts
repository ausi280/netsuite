import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapVendor } from '../mappers/vendorMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { VendorRow } from '../repositories/vendorRepository';
import type { SyncEntityName } from '../config/types';

export class VendorSyncService extends BaseSyncService<RawNetSuiteRecord, VendorRow> {
  readonly entityName: SyncEntityName = 'vendor';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('vendor')
      .select('id', 'entityid', 'companyname', 'email', 'phone', 'subsidiary', 'isinactive', 'lastmodifieddate')
      .whereWatermark('lastmodifieddate', watermark, tieBreakId)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): VendorRow {
    return mapVendor(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
