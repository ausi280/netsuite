import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapPeServicio } from '../mappers/peServicioMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { PeServicioRow } from '../repositories/peServicioRepository';
import type { SyncEntityName } from '../config/types';

/**
 * customrecord_cryo_pe_servicios, like customrecord_cryo_medicos, uses `lastmodified`
 * (account-locale date text) rather than the standard-entity `lastmodifieddate` field name.
 */
export class PeServicioSyncService extends BaseSyncService<RawNetSuiteRecord, PeServicioRow> {
  readonly entityName: SyncEntityName = 'peServicio';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_pe_servicios')
      .whereWatermark('lastmodified', watermark, tieBreakId)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): PeServicioRow {
    return mapPeServicio(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
