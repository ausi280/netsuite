// Types matching the fixed backend reporting API contract (api/src-ts/reporting/*).
// Do not add fields speculatively - keep this in sync with the actual contract only.

export type ReportEntityKey =
  | 'contracts'
  | 'customers'
  | 'family-members'
  | 'employees'
  | 'hospitals'
  | 'partidas'
  | 'services'
  | 'serial-numbers';

export interface EntitySummary {
  key: ReportEntityKey;
  label: string;
  rowCount: number;
  lastSyncedAt: string | null;
  lastRunStatus: string | null;
}

export type SortDir = 'asc' | 'desc';

export interface ReportRow {
  [column: string]: unknown;
}

export interface PaginatedRows<T = ReportRow> {
  success: true;
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ReportRecord {
  [column: string]: unknown;
  raw_data: Record<string, unknown>;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
