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
  | 'serial-numbers'
  | 'fiscal-updates'
  | 'payments'
  | 'vendors'
  | 'vendor-transactions';

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
  /** NetSuite currency internal id (e.g. "1" for MXN), or null if the partida has no currency set. */
  currency: string | null;
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
  folio_sistema_anterior: string | null;
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

/** One service (Sangre/Tejido/ADN/Placenta/etc.) on a contract, with the processing-sale amount
 * that feeds into the contract's total_servicios. */
export interface ServiceCommissionLine {
  netsuite_id: string;
  /** NetSuite service-type list id - resolve via serviceTypeLabel() for display (e.g. '15' = Placenta). */
  tipo: string | null;
  precio_procesamiento: number;
  is_placenta: boolean;
}

/** One year's worth of "Anualidad" partidas (storage prepaid in advance) on a contract - each
 * such partida pays a flat $100 bonus; "Procesamiento" partidas (the processing sale itself,
 * already covered by ServiceCommissionLine) never count here. */
export interface AnualidadYearLine {
  anio: string;
  count: number;
  monto: number;
}

export interface ContractCommission {
  netsuite_id: string;
  name: string | null;
  numero_contrato: string | null;
  fecha_inicio: string | null;
  estatus: string | null;
  subsidiaria_id: string | null;
  moneda: string | null;
  titular_nombre: string | null;
  services: ServiceCommissionLine[];
  /** Sum of every active service's precio_procesamiento on this contract, Placenta included - the
   * base both the tiered commission and the Placenta bonus are computed from. */
  total_servicios: number;
  has_placenta: boolean;
  /** total_servicios * 3%, only when has_placenta - 0 otherwise. A fixed business rule ("no
   * matter what" nivel), not one of the configurable commission_level_tiers. */
  placenta_bonus: number;
  /** total_servicios * the vendedor's resolved tier_percentage / 100. */
  tier_commission: number;
  anualidades: AnualidadYearLine[];
  anualidad_bonus_total: number;
  total_commission: number;
}

export interface VendedorCommissionGroup {
  vendedor_id: string;
  vendedor_nombre: string | null;
  nivel: string | null;
  /** This vendedor's TOTAL services sum for the period, across every one of their contracts and
   * subsidiaries (Placenta included) - NOT limited by any subsidiary/currency filter on this
   * request, since the commission tier reflects true total volume, not one filtered slice of it. */
  total_servicios_periodo: number;
  /** The single tiered rate resolved from total_servicios_periodo under this vendedor's nivel -
   * applied uniformly to every one of their contracts below. Null if the vendedor has no nivel,
   * or that nivel has no tier covering this amount. */
  tier_percentage: number | null;
  contracts: ContractCommission[];
  contracts_count: number;
  total_commission: number;
}

export interface EmployeeLevel {
  netsuite_id: string;
  entityid: string | null;
  email: string | null;
  isinactive: boolean | null;
  nivel: string | null;
}

export interface CommissionLevelTier {
  id: number;
  nivel: string;
  min_amount: number;
  percentage: number;
}

export interface CommissionsResponse {
  success: true;
  data: VendedorCommissionGroup[];
  month: number;
  year: number;
}

/** A collection-call note from the pre-NetSuite CryoCell system (table NotasCobranza). */
export interface NotaCobranza {
  fecha: string | null;
  usuario: string | null;
  nota: string | null;
  urgente: boolean;
}

export interface ContractNotasResponse {
  success: true;
  data: NotaCobranza[];
  /** The legacy folio these notes were looked up by, or null if this contract has none (created directly in NetSuite). */
  folio: string | null;
}

/** A MercadoPago payment log row (app_payments, owned by the separate `payment` project - shared DB, read-only here). */
export interface PaymentRow {
  id: number;
  payment_id: string;
  transaction_amount: number;
  payer_email: string | null;
  payment_method_id: string | null;
  installments: number | null;
  description: string | null;
  status: string;
  status_detail: string | null;
  /** Raw JSON string - contains contractId/customerId/subsidiariaId/domiciliar/domiciliationInfo, parsed client-side same as the original page did. */
  payloadRequest: string;
  created_at: string;
  /** Resolved via netsuite_contracts - the original page only ever showed the raw internal id. */
  contract_name: string | null;
  /** The linked contract's own subsidiary id (custrecord_cryo_subsidiariacontrato) - null if the contract couldn't be resolved. */
  subsidiary_id: string | null;
}

export interface ChargeDomiciledRequest {
  originalPaymentId: string;
  amount: string;
  reference: string;
  subsidiariaId: number;
  contractId: number;
  customerId: number;
  payer: { email: string };
  summary: { description: string };
}

export interface ChargeDomiciledResponse {
  id?: string | number;
  status?: string;
  status_detail?: string;
  authorization_code?: string | number;
  message?: string;
}

export interface ApiError {
  success: false;
  message: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
