import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapServicePackage } from '../mappers/servicePackageMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { ServicePackageRow } from '../repositories/servicePackageRepository';
import type { SyncEntityName } from '../config/types';

export class ServicePackageSyncService extends BaseSyncService<RawNetSuiteRecord, ServicePackageRow> {
  readonly entityName: SyncEntityName = 'servicePackage';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_configservicios')
      .whereWatermark('lastmodified', watermark)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): ServicePackageRow {
    return mapServicePackage(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
