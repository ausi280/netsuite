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

export type PartidaDimension = 'month' | 'status' | 'subsidiary' | 'servicetype';

export interface PartidaBreakdownRow {
  key: string;
  count: number;
  sum: number;
}

export interface PartidaAnalyticsResponse {
  success: true;
  dimension: PartidaDimension;
  data: PartidaBreakdownRow[];
}

export interface EntitiesResponse {
  success: true;
  data: EntitySummary[];
  isAdmin: boolean;
}

export interface AdminUserSummary {
  oid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  allowedEntities: ReportEntityKey[];
  allowedSubsidiaries: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserPermissionUpdate {
  isAdmin: boolean;
  allowedEntities: ReportEntityKey[];
  allowedSubsidiaries: string[];
}

export interface ContractDossierHeader {
  netsuite_id: string;
  name: string | null;
  numero_contrato: string | null;
  estatus: string | null;
  isinactive: string | null;
  fecha_inicio: string | null;
  subsidiaria_id: string | null;
  moneda: string | null;
  tipo_cambio: string | null;
  saldo_inicial: string | null;
  total: number | null;
  total_adeudos: number | null;
  total_partidas: number | null;
  titular_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  padres_id: string | null;
  padres_nombre: string | null;
  hijo_id: string | null;
  hijo_nombre: string | null;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  cobrador_id: string | null;
  cobrador_nombre: string | null;
}

export interface ContractDossier {
  contract: ContractDossierHeader;
  services: ReportRow[];
  annuities: ReportRow[];
}

export interface CommissionRow {
  netsuite_id: string;
  name: string | null;
  numero_contrato: string | null;
  fecha_inicio: string | null;
  estatus: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  vendedor_id: string;
  vendedor_nombre: string | null;
  saldo_inicial: string | null;
  total: number | null;
}

export interface CommissionsResponse {
  success: true;
  data: CommissionRow[];
  month: number;
  year: number;
}

export interface ApiError {
  success: false;
  message: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
