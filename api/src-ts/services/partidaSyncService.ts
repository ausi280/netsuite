import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapPartida } from '../mappers/partidaMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { PartidaRow } from '../repositories/partidaRepository';
import type { SyncEntityName } from '../config/types';

export class PartidaSyncService extends BaseSyncService<RawNetSuiteRecord, PartidaRow> {
  readonly entityName: SyncEntityName = 'partida';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('customrecord_cryo_partidas')
      .whereWatermark('lastmodified', watermark, tieBreakId)
      .orderBy('lastmodified', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): PartidaRow {
    return mapPartida(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodified);
  }
}
