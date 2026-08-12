import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapHospital } from '../mappers/hospitalMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { HospitalRow } from '../repositories/hospitalRepository';
import type { SyncEntityName } from '../config/types';

/**
 * customrecord_cryo_hospitales, like customrecord1184 and
 * customrecord_cryo_familia, uses `lastmodified` (account-locale date text)
 * rather than the standard-entity `lastmodifieddate` field name.
 */
export class HospitalSyncService extends BaseSyncService<RawNetSuiteRecord, HospitalRow> {
  readonly entityName: SyncEntityName = 'hospital';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_hospitales')
      .whereWatermark('lastmodified', watermark)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): HospitalRow {
    return mapHospital(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
