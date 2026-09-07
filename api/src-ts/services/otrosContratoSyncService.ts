import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapOtrosContrato } from '../mappers/otrosContratoMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { OtrosContratoRow } from '../repositories/otrosContratoRepository';
import type { SyncEntityName } from '../config/types';

/**
 * customrecord_cryo_otroscontratos, like customrecord_cryo_medicos, uses `lastmodified`
 * (account-locale date text) rather than the standard-entity `lastmodifieddate` field name.
 */
export class OtrosContratoSyncService extends BaseSyncService<RawNetSuiteRecord, OtrosContratoRow> {
  readonly entityName: SyncEntityName = 'otrosContrato';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_otroscontratos')
      .whereWatermark('lastmodified', watermark, tieBreakId)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): OtrosContratoRow {
    return mapOtrosContrato(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
