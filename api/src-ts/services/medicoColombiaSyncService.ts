import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapMedicoColombia } from '../mappers/medicoColombiaMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { MedicoColombiaRow } from '../repositories/medicoColombiaRepository';
import type { SyncEntityName } from '../config/types';

/** customrecord_cryo_ginecologo, same `lastmodified`-locale-text watermark shape as the other custom records. */
export class MedicoColombiaSyncService extends BaseSyncService<RawNetSuiteRecord, MedicoColombiaRow> {
  readonly entityName: SyncEntityName = 'medicoColombia';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_ginecologo')
      .whereWatermark('lastmodified', watermark, tieBreakId)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): MedicoColombiaRow {
    return mapMedicoColombia(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
