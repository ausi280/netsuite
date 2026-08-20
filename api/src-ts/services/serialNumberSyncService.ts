import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapSerialNumber } from '../mappers/serialNumberMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { SerialNumberRow } from '../repositories/serialNumberRepository';
import type { SyncEntityName } from '../config/types';

// Scoped to item 2394 ("KIT DE RECOLECCION - SCU Y TCU") per explicit team
// request — not a general serial-number sync across all items.
const ITEM_ID = '2394';

export class SerialNumberSyncService extends BaseSyncService<RawNetSuiteRecord, SerialNumberRow> {
  readonly entityName: SyncEntityName = 'serialNumber';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    // inventorynumber itself has no subsidiary/location field (verified: those
    // field names 400 directly on it) — the subsidiary lives on the parent
    // item, joined in here rather than hardcoded, since it reflects whatever
    // NetSuite has right now instead of a value that could go stale.
    return SuiteQlQueryBuilder.from(`inventorynumber n JOIN item i ON n.item = i.id`, 'n.id')
      .select('n.id', 'n.inventorynumber', 'n.item', 'n.lastmodifieddate', 'i.subsidiary')
      .where(`n.item = '${ITEM_ID}'`)
      .whereWatermark('n.lastmodifieddate', watermark, tieBreakId)
      .orderBy('n.lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): SerialNumberRow {
    return mapSerialNumber(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
