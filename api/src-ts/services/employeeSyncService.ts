import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapEmployee } from '../mappers/employeeMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { EmployeeRow } from '../repositories/employeeRepository';
import type { SyncEntityName } from '../config/types';

export class EmployeeSyncService extends BaseSyncService<RawNetSuiteRecord, EmployeeRow> {
  readonly entityName: SyncEntityName = 'employee';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('employee')
      .select('id', 'entityid', 'email', 'isinactive', 'lastmodifieddate')
      .whereWatermark('lastmodifieddate', watermark, tieBreakId)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): EmployeeRow {
    return mapEmployee(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
