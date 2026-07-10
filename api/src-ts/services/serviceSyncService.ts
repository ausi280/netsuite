import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapService } from '../mappers/serviceMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { ServiceRow } from '../repositories/serviceRepository';
import type { SyncEntityName } from '../config/types';

/**
 * customrecord_cryo_servicios, like the other cryo custom records, uses
 * `lastmodified` (account-locale date text) rather than the
 * standard-entity `lastmodifieddate` field name.
 */
export class ServiceSyncService extends BaseSyncService<RawNetSuiteRecord, ServiceRow> {
  readonly entityName: SyncEntityName = 'service';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_servicios')
      .whereWatermark('lastmodified', watermark)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): ServiceRow {
    return mapService(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
