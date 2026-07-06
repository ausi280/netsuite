import type { EmployeeRow } from '../repositories/employeeRepository';
import { toBool, toDate, toStringOrNull } from './utils';

export function mapEmployee(raw: Record<string, any>): EmployeeRow {
  return {
    netsuite_id: String(raw.id),
    entityid: toStringOrNull(raw.entityid),
    email: toStringOrNull(raw.email),
    isinactive: toBool(raw.isinactive),
    lastmodifieddate: toDate(raw.lastmodifieddate),
    raw_data: JSON.stringify(raw),
  };
}
