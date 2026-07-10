import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapContract } from '../mappers/contractMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { ContractRow } from '../repositories/contractRepository';
import type { SyncEntityName } from '../config/types';

/**
 * customrecord1184 uses `lastmodified` (not the standard-entity
 * `lastmodifieddate` field name) as its last-modified column, matching the
 * legacy full-sync query (netsuiteService.js:108).
 */
export class ContractSyncService extends BaseSyncService<RawNetSuiteRecord, ContractRow> {
  readonly entityName: SyncEntityName = 'contract';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('customrecord1184')
      .whereWatermark('lastmodified', watermark)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): ContractRow {
    return mapContract(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
