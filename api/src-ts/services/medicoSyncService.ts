import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapMedico } from '../mappers/medicoMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { MedicoRow } from '../repositories/medicoRepository';
import type { SyncEntityName } from '../config/types';

/**
 * customrecord_cryo_medicos, like customrecord_cryo_arg_hospitales, uses
 * `lastmodified` (account-locale date text) rather than the standard-entity
 * `lastmodifieddate` field name.
 */
export class MedicoSyncService extends BaseSyncService<RawNetSuiteRecord, MedicoRow> {
  readonly entityName: SyncEntityName = 'medico';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_medicos')
      .whereWatermark('lastmodified', watermark, tieBreakId)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): MedicoRow {
    return mapMedico(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
