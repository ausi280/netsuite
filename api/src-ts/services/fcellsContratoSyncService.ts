import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapFcellsContrato } from '../mappers/fcellsContratoMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { FcellsContratoRow } from '../repositories/fcellsContratoRepository';
import type { SyncEntityName } from '../config/types';

/**
 * customrecord_cryo_fcells, like customrecord_cryo_medicos/otroscontratos, uses `lastmodified`
 * (account-locale date text) rather than the standard-entity `lastmodifieddate` field name.
 */
export class FcellsContratoSyncService extends BaseSyncService<RawNetSuiteRecord, FcellsContratoRow> {
  readonly entityName: SyncEntityName = 'fcellsContrato';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_fcells')
      .whereWatermark('lastmodified', watermark, tieBreakId)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): FcellsContratoRow {
    return mapFcellsContrato(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
