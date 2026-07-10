import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapFamilyMember } from '../mappers/familyMemberMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { FamilyMemberRow } from '../repositories/familyMemberRepository';
import type { SyncEntityName } from '../config/types';

/**
 * customrecord_cryo_familia, like customrecord1184, uses `lastmodified`
 * (account-locale date text) rather than the standard-entity
 * `lastmodifieddate` field name.
 */
export class FamilyMemberSyncService extends BaseSyncService<RawNetSuiteRecord, FamilyMemberRow> {
  readonly entityName: SyncEntityName = 'familyMember';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_familia')
      .whereWatermark('lastmodified', watermark)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): FamilyMemberRow {
    return mapFamilyMember(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
