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
  | 'vendor-transactions'
  | 'otros-contratos'
  | 'fcells-contratos';

/**
 * Every key grantable via the per-user allowedEntities permission list: every ReportEntityKey
 * (each with a generic list/detail/CSV table view) plus 'hr' and 'prospectos', which are gated the
 * same way but have no generic table of their own (see HrDimension / ProspectoRow below).
 * 'commissions' is different again: not a standalone grant, but an ADDITIONAL gate on top of
 * 'contracts' - 'contracts' alone no longer shows every vendedor's commissions, only once
 * 'commissions' is granted too (see EntitiesResponse.canAccessCommissions below).
 */
export type PermissionKey = ReportEntityKey | 'hr' | 'prospectos' | 'commissions';

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
  canAccessHr: boolean;
  /** True for isAdmin/'contracts'-granted callers, but ALSO for a "self-vendedor" - someone with
   * neither grant whose Entra email matches a netsuite_employees row that has sold at least one
   * contract/otros-contrato as vendedor. That second group only ever sees their own commissions
   * (enforced server-side), never the full contracts entity. */
  canAccessCommissions: boolean;
  canAccessProspectos: boolean;
}

// HR Report - backed by the Peopleforce/Sesame HR data warehouse (DwhCryoholdcoLatam_Prod), a
// completely separate database from every other report. Deliberately NOT a ReportEntityKey: it
// has no generic paginated list/detail/CSV export (the table holds employee PII - names,
// birthdays - and nothing asked for a raw browsable table of that), just this bespoke aggregate
// analytics endpoint, gated via the 'hr' PermissionKey same as any other report. See
// api/src-ts/reporting/hrController.ts.
export type HrDimension = 'brand' | 'department' | 'gender' | 'country' | 'status' | 'age' | 'seniority' | 'hiremonth';

export interface HrBreakdownRow {
  key: string;
  count: number;
}

export interface HrSummary {
  total: number;
  active: number;
  inactive: number;
}

export interface HrSummaryResponse {
  success: true;
  data: HrSummary;
}

export interface HrAnalyticsResponse {
  success: true;
  dimension: HrDimension;
  activeOnly: boolean;
  data: HrBreakdownRow[];
}

export interface AdminUserSummary {
  oid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  allowedEntities: PermissionKey[];
  allowedSubsidiaries: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserPermissionUpdate {
  isAdmin: boolean;
  allowedEntities: PermissionKey[];
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

/** One employee, for the "Vendedor" edit field's picker (GET /reports/contracts/vendedores). */
export interface VendedorOption {
  netsuite_id: string;
  entityid: string | null;
}

/** Body for PATCH /reports/contracts/:id - either key may be omitted to leave that field
 * untouched; null clears it. Writes to NetSuite first, then mirrors into the local DB. */
export interface UpdateContractInput {
  custrecord_cryo_contratosistemaanterior?: string | null;
  custrecord_cryo_vendedor?: string | null;
}

export interface UpdateContractResponse {
  success: true;
  data: { netsuite_id: string } & UpdateContractInput;
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

/** One year's worth of "Anualidad" partidas (storage prepaid in advance) on a contract - the whole
 * year pays a single flat $100 bonus, not one per service-type line; "Procesamiento" partidas (the
 * processing sale itself, already covered by ServiceCommissionLine) never count here. */
export interface AnualidadYearLine {
  anio: string;
  /** How many service-type Anualidad lines (SCU/TCU/ADN/etc.) exist for this año - informational
   * only, since the $100 bonus is paid once per year regardless of this count. */
  count: number;
  /** Always $100 - one flat bonus for the year, not count * that amount. */
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
  /** custrecord_cryo_contratosistemaanterior - the legacy CryoCell folio, when this contract has one. */
  folio_sistema_anterior: string | null;
  services: ServiceCommissionLine[];
  /** Sum of every active service's precio_procesamiento on this contract, Placenta included - the
   * base both the tiered commission and the Placenta bonus are computed from. */
  total_servicios: number;
  has_placenta: boolean;
  /** Whether this contract's paperwork is complete in the legacy system (Mexico subsidiaries
   * only - always true elsewhere). When false, every commission figure below is 0 even though
   * the contract and its services still display normally. */
  docs_completos: boolean;
  /** total_servicios * 3%, only when has_placenta and docs_completos - 0 otherwise. A fixed
   * business rule ("no matter what" nivel), not one of the configurable commission_level_tiers. */
  placenta_bonus: number;
  /** total_servicios * the vendedor's resolved tier_percentage / 100. */
  tier_commission: number;
  anualidades: AnualidadYearLine[];
  anualidad_bonus_total: number;
  total_commission: number;
}

/** An "Otros Contratos" sale (a distinct sample-collection record type, not a regular contract) -
 * its linked Servicio package's price feeds the same tiered commission as a contract's services
 * total, with no Placenta or anualidad bonus equivalent. */
export interface OtrosContratoCommission {
  netsuite_id: string;
  name: string | null;
  fecha: string | null;
  servicio_nombre: string | null;
  monto: number;
  moneda: string | null;
  /** monto * the vendedor's resolved tier_percentage / 100. */
  tier_commission: number;
}

export interface VendedorCommissionGroup {
  vendedor_id: string;
  vendedor_nombre: string | null;
  /** The vendedor's Contratos nivel - independent from nivel_otros_contratos; Contratos and Otros
   * Contratos sales don't sum together for tier resolution. */
  nivel_contratos: string | null;
  /** This vendedor's TOTAL contracts-services sum for the period, across every subsidiary - NOT
   * limited by any subsidiary/currency filter on this request, and NOT combined with the Otros
   * Contratos total below. */
  total_ventas_contratos_periodo: number;
  /** The tiered rate resolved from total_ventas_contratos_periodo under nivel_contratos - applied
   * uniformly to every one of this vendedor's contracts below. Null if the vendedor has no
   * nivel_contratos, or that nivel has no tier covering this amount. */
  tier_percentage_contratos: number | null;
  /** The vendedor's Otros Contratos nivel - independent from nivel_contratos. */
  nivel_otros_contratos: string | null;
  /** This vendedor's TOTAL otros-contratos sales sum for the period, across every subsidiary - NOT
   * limited by any subsidiary/currency filter on this request, and NOT combined with
   * total_ventas_contratos_periodo. */
  total_ventas_otros_contratos_periodo: number;
  /** The tiered rate resolved from total_ventas_otros_contratos_periodo under
   * nivel_otros_contratos - applied uniformly to every one of this vendedor's otros-contratos
   * below. Null if the vendedor has no nivel_otros_contratos, or that nivel has no tier covering
   * this amount. */
  tier_percentage_otros_contratos: number | null;
  contracts: ContractCommission[];
  contracts_count: number;
  /** Sum of every contract's total_commission - paid as its own transaction, separate from
   * otros_contratos_commission (contracts and otros-contratos are two distinct payouts, on two
   * independent tiers). */
  contracts_commission: number;
  otros_contratos: OtrosContratoCommission[];
  otros_contratos_count: number;
  /** Sum of every otros-contrato's tier_commission - its own separate transaction from contracts_commission. */
  otros_contratos_commission: number;
  /** contracts_commission + otros_contratos_commission - shown for convenience, not itself a payout. */
  total_commission: number;
}

export interface EmployeeLevel {
  netsuite_id: string;
  entityid: string | null;
  email: string | null;
  isinactive: boolean | null;
  /** Independent from nivel_otros_contratos - Contratos and Otros Contratos sales don't sum
   * together for tier resolution, so each has its own nivel. */
  nivel_contratos: string | null;
  nivel_otros_contratos: string | null;
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
  /** True when this response is scoped to one "self-vendedor" caller's own sales (see
   * EntitiesResponse.canAccessCommissions) rather than every vendedor. */
  isSelfVendedor: boolean;
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

/** A NetSuite-native Note (the note.nl UI page), via the "Get notes" RESTlet. */
export interface NetSuiteNote {
  id: string;
  title: string | null;
  note: string | null;
  author: string | null;
  date: string | null;
  direction: string | null;
  noteType: string | null;
  urgente: boolean;
}

export interface ContractNetSuiteNotesResponse {
  success: true;
  data: NetSuiteNote[];
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

/**
 * One row of the "Prospectos" CRM lead-funnel report - reproduces the sales team's own
 * hand-written SSMS query against the legacy Cryo.dbo database (Prospecto joined to its
 * Lead/Etapa/Ciudad/TipoCanal/Canal/Vendedor/Contrato), filtered by a FechaCaptura date range.
 * See api/src-ts/reporting/prospectosRepository.ts.
 */
export interface ProspectoRow {
  madre_completo: string | null;
  padre_completo: string | null;
  fecha_probable: string | null;
  telefonos: string | null;
  ciudad: string | null;
  tipo_canal: string | null;
  canal: string | null;
  estatus: string | null;
  id_prospecto: number;
  fecha_captura: string | null;
  mes: number | null;
  etapa: string | null;
  motivo: string | null;
  activo: boolean | null;
  vendedor: string | null;
  id_empresa: number | null;
  tareas: number;
  /** ':D' when this prospecto converted to a contract, ':(' otherwise. */
  contrato: string;
  fecha_cierre_tarea: string | null;
  nota_tarea: string | null;
  fecha_venta: string | null;
  folio_contrato: string | null;
  mes_cancelacion: number | null;
}

export interface ProspectosResponse {
  success: true;
  data: ProspectoRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * One row of the "Cuentas" per-contract account/collections detail sheet, reached from the
 * Partidas report. Built from NetSuite (contract/titular/second-titular/child/dueño/services) and,
 * for contracts with a legacy folio match, the pre-NetSuite Cryo.dbo system (adeudo, estatus,
 * zona, metal, teléfonos, etc. - null when no legacy record exists, e.g. Argentina/Peru contracts
 * or ones not yet backfilled). See api/src-ts/reporting/cuentasRepository.ts.
 *
 * Fields typed as always-null here (titular2_telefono, interes, referencia_cie, referencia_sap,
 * fp_scu/tcu/dx/adn, super_promo, link_pago, pagado_hasta_scu/tcu/dx/adn) have NO confirmed data
 * source anywhere in NetSuite or Cryo.dbo after checking both schemas - see
 * CuentasResponse.unavailableColumns, which the page surfaces as a note instead of silently
 * rendering blank cells that look like real (missing) data.
 */
export interface CuentaRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  titular_telefono: string | null;
  fecha_nacimiento_confirmada: string | null;
  mes_nacimiento: number | null;
  titular2_nombre: string | null;
  titular2_email: string | null;
  titular2_telefono: null;
  numero_anos: number | null;
  adeudo_total: number | null;
  interes: null;
  costo_anualidad: number | null;
  nombre_hijo: string | null;
  referencia_cie: null;
  referencia_sap: null;
  zona: string | null;
  fp_scu: null;
  fp_tcu: null;
  fp_dx: null;
  fp_adn: null;
  pago_automatico: boolean | null;
  estatus_cliente: string | null;
  estatus_cobranza: string | null;
  metal: string | null;
  tel_casa1: string | null;
  tel_casa2: string | null;
  cel_mama: string | null;
  cel_papa: string | null;
  tel_oficina_madre: string | null;
  tel_oficina_padre: string | null;
  tel_pariente1: string | null;
  tel_pariente2: string | null;
  super_promo: null;
  link_pago: null;
  token_sat: string | null;
  pagado_hasta_scu: null;
  pagado_hasta_tcu: null;
  pagado_hasta_dx: null;
  pagado_hasta_adn: null;
  dueno: string | null;
  no_molestar: boolean | null;
}

export interface CuentasResponse {
  success: true;
  data: CuentaRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unavailableColumns: Array<{ key: keyof CuentaRow; label: string }>;
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
