import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapEmployee } from '../mappers/employeeMapper';
import type { EmployeeRow } from '../repositories/employeeRepository';
import type { SyncEntityName } from '../config/types';

export class EmployeeSyncService extends BaseSyncService<RawNetSuiteRecord, EmployeeRow> {
  readonly entityName: SyncEntityName = 'employee';

  protected buildQuery(watermark: Date | null): string {
    return SuiteQlQueryBuilder.from('employee')
      .select('id', 'entityid', 'email', 'isinactive', 'lastmodifieddate')
      .whereWatermark('lastmodifieddate', watermark)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): EmployeeRow {
    return mapEmployee(raw);
  }
}
