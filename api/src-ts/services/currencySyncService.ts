import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapCurrency } from '../mappers/currencyMapper';
import type { CurrencyRow } from '../repositories/currencyRepository';
import type { SyncEntityName } from '../config/types';

/**
 * NetSuite's `currency` table has no lastmodified column and only a handful of rows, so every run
 * is a full pull (the watermark is ignored) - CurrencyRepository also records a daily snapshot.
 */
export class CurrencySyncService extends BaseSyncService<RawNetSuiteRecord, CurrencyRow> {
  readonly entityName: SyncEntityName = 'currency';

  protected buildQuery(): string {
    return SuiteQlQueryBuilder.from('currency').orderBy('id', 'ASC').build();
  }

  protected mapRow(raw: RawNetSuiteRecord): CurrencyRow {
    return mapCurrency(raw);
  }

  protected extractTimestamp(): Date | null {
    return null;
  }
}
