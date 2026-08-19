import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapServiceType } from '../mappers/serviceTypeMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { ServiceTypeRow } from '../repositories/serviceTypeRepository';
import type { SyncEntityName } from '../config/types';

export class ServiceTypeSyncService extends BaseSyncService<RawNetSuiteRecord, ServiceTypeRow> {
  readonly entityName: SyncEntityName = 'serviceType';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('customlist_cryo_tiposervicio')
      .whereWatermark('lastmodified', watermark)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): ServiceTypeRow {
    return mapServiceType(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
