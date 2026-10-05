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
 * 'commissions_amounts' is a THIRD, further gate on top of both - without it, a full-access caller
 * still sees every vendedor/contract and its Docs Completos status, but every dollar figure comes
 * back null (see CommissionsResponse.canSeeAmounts) - for someone reviewing/approving paperwork
 * completeness who shouldn't see commission amounts. Never affects a self-vendedor viewing their
 * own commissions.
 * 'tareas_vencidas' is its own standalone grant (same shape as 'hr'/'prospectos', NOT an
 * additional gate on top of 'prospectos') for the Tareas Vencidas sub-report embedded in the
 * Comercial page - see api/src-ts/reporting/tareasVencidasController.ts.
 */
export type PermissionKey = ReportEntityKey | 'hr' | 'prospectos' | 'commissions' | 'commissions_amounts' | 'tareas_vencidas';

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
  /** Null when the caller lacks the 'commissions_amounts' grant (see CommissionsResponse.canSeeAmounts). */
  precio_procesamiento: number | null;
  /** True when this line's tipo is Placenta or ADN - the two services that trigger the contract's
   * flat 3% bonus (see ContractCommission.placenta_adn_bonus). */
  is_bonus_service: boolean;
}

/** One year's worth of "Anualidad" partidas (storage prepaid in advance) on a contract - the whole
 * year pays a single flat $100 bonus, not one per service-type line; "Procesamiento" partidas (the
 * processing sale itself, already covered by ServiceCommissionLine) never count here. */
export interface AnualidadYearLine {
  anio: string;
  /** How many service-type Anualidad lines (SCU/TCU/ADN/etc.) exist for this año - informational
   * only, since the $100 bonus is paid once per year regardless of this count. */
  count: number;
  /** Always $100 - one flat bonus for the year, not count * that amount. Null when redacted (see
   * ServiceCommissionLine.precio_procesamiento). */
  monto: number | null;
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
  /** Pagado services only - an active service with any other payment status is excluded here
   * (and from total_servicios), never shown as if it counted. */
  services: ServiceCommissionLine[];
  /** Distinct custrecord_cryo_statuspagoserv codes (same list as PARTIDA_STATUS_LABELS) among this
   * contract's ACTIVE services that are NOT Pagado, so excluded from `services`/total_servicios/
   * the commission figures below. Lets the UI explain why a contract shows no services/commission
   * when it actually has some, just unpaid (e.g. "Vencido") - instead of looking identical to a
   * contract with zero services at all. Empty when every active service is Pagado, or the
   * contract genuinely has no active services. Never redacted (a status, not a dollar amount). */
  non_paid_service_statuses: string[];
  /** Sum of every active service's precio_procesamiento on this contract, Placenta/ADN included -
   * the base both the tiered commission and the special bonus are computed from. Null when
   * redacted (see ServiceCommissionLine.precio_procesamiento). */
  total_servicios: number | null;
  /** True when the contract has a Placenta and/or ADN service (expanded from Placenta-only on
   * 2026-09-30). Never redacted - a status flag, not a dollar amount. */
  has_bonus_service: boolean;
  /** Whether this contract's paperwork is complete in the legacy system (Mexico subsidiaries
   * only - always true elsewhere). Display-only - does NOT affect any commission figure below,
   * which is always computed the same regardless of this flag. Never redacted - the whole point
   * of a 'commissions' grant without 'commissions_amounts' is to see and act on this flag without
   * seeing dollar amounts. */
  docs_completos: boolean;
  /** total_servicios * 3%, only when has_bonus_service - 0 otherwise. Paid once even when both
   * Placenta and ADN are present, never doubled. A fixed business rule ("no matter what" nivel),
   * not one of the configurable commission_level_tiers. Null when redacted. */
  placenta_adn_bonus: number | null;
  /** total_servicios * the vendedor's resolved tier_percentage / 100. Null when redacted. */
  tier_commission: number | null;
  anualidades: AnualidadYearLine[];
  /** Null when redacted. */
  anualidad_bonus_total: number | null;
  /** Null when redacted. */
  total_commission: number | null;
}

/** An "Otros Contratos" sale (a distinct sample-collection record type, not a regular contract) -
 * its linked Servicio package's price feeds the same tiered commission as a contract's services
 * total, with no Placenta or anualidad bonus equivalent. */
export interface OtrosContratoCommission {
  netsuite_id: string;
  name: string | null;
  fecha: string | null;
  servicio_nombre: string | null;
  /** Null when redacted (see ServiceCommissionLine.precio_procesamiento). */
  monto: number | null;
  moneda: string | null;
  /** monto * the vendedor's resolved tier_percentage / 100. Null when redacted. */
  tier_commission: number | null;
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
  /** Null when redacted (see ServiceCommissionLine.precio_procesamiento). */
  total_ventas_contratos_periodo: number | null;
  /** The tiered rate resolved from total_ventas_contratos_periodo under nivel_contratos - applied
   * uniformly to every one of this vendedor's contracts below. Null if the vendedor has no
   * nivel_contratos, or that nivel has no tier covering this amount. */
  tier_percentage_contratos: number | null;
  /** The vendedor's Otros Contratos nivel - independent from nivel_contratos. */
  nivel_otros_contratos: string | null;
  /** This vendedor's TOTAL otros-contratos sales sum for the period, across every subsidiary - NOT
   * limited by any subsidiary/currency filter on this request, and NOT combined with
   * total_ventas_contratos_periodo. */
  /** Null when redacted. */
  total_ventas_otros_contratos_periodo: number | null;
  /** The tiered rate resolved from total_ventas_otros_contratos_periodo under
   * nivel_otros_contratos - applied uniformly to every one of this vendedor's otros-contratos
   * below. Null if the vendedor has no nivel_otros_contratos, or that nivel has no tier covering
   * this amount. */
  tier_percentage_otros_contratos: number | null;
  contracts: ContractCommission[];
  contracts_count: number;
  /** Sum of every contract's total_commission - paid as its own transaction, separate from
   * otros_contratos_commission (contracts and otros-contratos are two distinct payouts, on two
   * independent tiers). Null when redacted. */
  contracts_commission: number | null;
  otros_contratos: OtrosContratoCommission[];
  otros_contratos_count: number;
  /** Sum of every otros-contrato's tier_commission - its own separate transaction from
   * contracts_commission. Null when redacted. */
  otros_contratos_commission: number | null;
  /** contracts_commission + otros_contratos_commission - shown for convenience, not itself a
   * payout. Null when redacted. */
  total_commission: number | null;
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
  /** False only for a full-access caller without 'commissions_amounts' - every dollar figure in
   * `data` is then null (see redactCommissionAmounts on the backend). Always true for a
   * self-vendedor - this never hides someone's own commissions. */
  canSeeAmounts: boolean;
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

/** One (year, month) bucket of "Reporte de Marketing"'s sales-by-month chart - a "sale" is any
 * Prospecto with a matched Contrato, bucketed by the CONTRACT's own FechaVenta (not the
 * prospecto's capture date), split online/offline by the prospecto's own channel. See the
 * file-level comment in api/src-ts/reporting/marketingRepository.ts for exactly which
 * Cryo.dbo.TipoCanal ids count as "online" (confirmed live, per empresa). */
export interface MarketingSalesByMonthRow {
  anio: number;
  mes: number;
  online: number;
  offline: number;
  total: number;
}

export type ProspectoQualificationCategory = 'Calificados' | 'No contactado' | 'Lead no calificado';

export interface ProspectoQualificationSummary {
  calificados: number;
  no_contactado: number;
  lead_no_calificado: number;
  total: number;
}

/** One (year, month, canal) bucket of the qualification chart, by Prospecto.FechaCaptura - same
 * year/month bucketing convention as MarketingSalesByMonthRow, further split online/offline. */
export interface QualificationByMonthRow extends ProspectoQualificationSummary {
  anio: number;
  mes: number;
  canal: 'online' | 'offline';
}

/** One distinct (year, month, empresa, motivo) combination actually present in the date range,
 * with its resolved category - shown in full so it's always clear exactly which raw
 * Cryo.dbo.noventa row rolled into which bucket, per empresa and per month (the same motivo name
 * can be a different ID_NoVenta per empresa - see the repository file-level comment). */
export interface MarketingMotivoBreakdownRow {
  anio: number;
  mes: number;
  id_empresa: number;
  id_noventa: number | null;
  motivo: string;
  categoria: ProspectoQualificationCategory;
  cantidad: number;
}

export interface MarketingReportResponse {
  success: true;
  salesByMonth: MarketingSalesByMonthRow[];
  qualification: {
    summary: ProspectoQualificationSummary;
    byMonth: QualificationByMonthRow[];
    motivos: MarketingMotivoBreakdownRow[];
  };
}

/** Online (Internet TipoCanal) vs offline (everything else) - same split
 * api/src-ts/reporting/marketingRepository.ts uses for the Marketing report. */
export type ProspectoCanal = 'online' | 'offline';

/** One (year, month, tareas count, activo state, canal, how many prospectos match) bucket - see
 * api/src-ts/reporting/comercialRepository.ts. Year is included alongside month since the default
 * date range already crosses a year boundary. `activo` and `canal` are both part of the grouping
 * key (not separate aggregates) so the frontend's Activos/Todos switch and Online/Offline split
 * can filter by summing only the rows matching the selected state. */
export interface TareasCountRow {
  anio: number;
  mes: number;
  tareas: number;
  activo: boolean;
  canal: ProspectoCanal;
  cantidad: number;
}

/** Same bucket shape, split per vendedor - one row per (vendedor, año, mes, tareas, activo, canal)
 * combination actually present in the period, not a full cross-product (a vendedor with no
 * prospecto at some tareas count simply has no row for it, rather than a zero-cantidad row). */
export interface TareasByVendedorRow extends TareasCountRow {
  id_vendedor: number;
  vendedor: string | null;
}

/** "Comercial" - how many Tarea (follow-up task) rows each prospecto accumulated, both overall
 * and per vendedor, over a FechaCaptura date range - same Prospecto/Lead/Vendedor data as
 * /reports/prospectos and /reports/marketing. */
export interface ComercialReportResponse {
  success: true;
  global: TareasCountRow[];
  porVendedor: TareasByVendedorRow[];
}

/**
 * "Tareas Vencidas" - Cryo.dbo.Tarea rows that are overdue and were never properly closed on time
 * (FechaFinal < today AND (FechaCierre IS NULL OR FechaCierre < FechaFinal)) - a Comercial
 * sub-report, same Prospecto/Lead/Vendedor join every other Comercial/Prospectos/Marketing report
 * uses. See api/src-ts/reporting/tareasVencidasRepository.ts.
 */
export interface TareaVencidaRow {
  id_tarea: number;
  tipo_tarea: string | null;
  fecha_inicial: string | null;
  /** The task's own deadline - always in the past for every row this report returns. */
  fecha_final: string | null;
  /** Null (never closed) or earlier than fecha_final. */
  fecha_cierre: string | null;
  nota: string | null;
  activo: boolean;
  id_vendedor: number;
  vendedor: string | null;
  id_prospecto: number;
  madre_completo: string | null;
  padre_completo: string | null;
  telefonos: string | null;
}

export interface TareasVencidasResponse {
  success: true;
  data: TareaVencidaRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Distinct (id_vendedor, vendedor) pairs for the Tareas Vencidas vendedor filter dropdown - same
 * duplicate-prone raw Vendedor rows as the Comercial report's own dropdown, deduped the same way
 * client-side (see web/src/utils/comercial.ts's normalizeVendedorName/listVendedores). */
export interface TareaVendedorOption {
  id_vendedor: number;
  vendedor: string | null;
}

export interface TareaVencidaVendedoresResponse {
  success: true;
  data: TareaVendedorOption[];
}

/** One (año, mes, how many matching Tarea rows) bucket - see
 * api/src-ts/reporting/tareasVencidasRepository.ts's getTareasVencidasByMonth. */
export interface TareaVencidaMonthRow {
  anio: number;
  mes: number;
  cantidad: number;
}

/** Same bucket shape, split per vendedor - one row per (vendedor, año, mes) combination actually
 * present (a vendedor/month with zero matching tareas simply has no row). */
export interface TareaVencidaByVendedorMonthRow extends TareaVencidaMonthRow {
  id_vendedor: number;
  vendedor: string | null;
}

export interface TareasVencidasByMonthResponse {
  success: true;
  global: TareaVencidaMonthRow[];
  porVendedor: TareaVencidaByVendedorMonthRow[];
}

/**
 * One row of the "Cuentas" per-contract account/collections detail sheet, reached from the
 * Partidas report. Sourced ENTIRELY from NetSuite, by design - no legacy Cryo.dbo/CryoCell
 * database dependency at all, so every non-null field here is directly verifiable against the
 * live NetSuite account. See the file-level comment in
 * api/src-ts/reporting/cuentasRepository.ts for exactly which column comes from where
 * (zona/estatus_cliente/estatus_cobranza/metal/pago_automatico/no_molestar/referencia_cie all
 * live on the same NetSuite contract record, under its "Clasificadores" tab, confirmed live via
 * SuiteQL - NOT a different custom type).
 *
 * Adeudo total and Pagado Hasta SCU/TCU/ADN come from netsuite_partidas (Adeudo = sum of overdue
 * "Vencido" partidas whose own date has passed; Pagado Hasta = the most recently PAID partida's
 * own date, per service type via custrecord_cryo_servtipo). Interés = sum of
 * custrecord_cryo_interes across every active partida on the contract, no status/date filter
 * (unlike Adeudo, this field is populated across every partida status, not just Vencido). Link
 * Pago = `https://renovaciones.cryo-cell.com.mx/dashboard/{token}`, token =
 * custrecord_nso_token. Teléfono celular (Titular 2) = the same family_members row's
 * custrecord_cryo_telefonocelular - the only phone field that table has (one per family member).
 * Teléfono 1-10 = the titular's own numbered "Teléfono N" custom entity fields on
 * netsuite_customers (confirmed by the user) - plain numbered fields with no attempt at semantic
 * relabeling (no "Cel Mamá"/"Tel Casa" distinction), replacing the old guessed Cryo.dbo-style
 * columns that never had a confirmed source. Field ids are irregular (Teléfono 1/2 carry a
 * doubled "custentitycustentity_" prefix; Teléfono 5 is `custentity3`, an auto-numbered id) - see
 * api/src-ts/reporting/cuentasRepository.ts for the full explanation. Fields typed as always-null
 * here (fp_dx, pagado_hasta_dx) have NO confirmed NetSuite source - see
 * CuentasResponse.unavailableColumns, which the page surfaces as a note instead of silently
 * rendering blank cells that look like real (missing) data. Referencia SAP, SuperPromo and
 * TokenSAT used to be always-null placeholders here too; removed from the report entirely at the
 * user's request.
 */
export interface CuentaRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  titular_telefono: string | null;
  telefono_1: string | null;
  telefono_2: string | null;
  telefono_3: string | null;
  telefono_4: string | null;
  telefono_5: string | null;
  telefono_6: string | null;
  telefono_7: string | null;
  telefono_8: string | null;
  telefono_9: string | null;
  telefono_10: string | null;
  fecha_nacimiento_confirmada: string | null;
  mes_nacimiento: number | null;
  titular2_nombre: string | null;
  titular2_email: string | null;
  titular2_telefono: string | null;
  numero_anos: number | null;
  adeudo_total: number | null;
  interes: number | null;
  costo_anualidad: number | null;
  tipo_servicio: string | null;
  nombre_hijo: string | null;
  referencia_cie: string | null;
  zona: string | null;
  fp_scu: string | null;
  fp_tcu: string | null;
  fp_dx: null;
  fp_adn: string | null;
  pago_automatico: boolean | null;
  estatus_cliente: string | null;
  estatus_cobranza: string | null;
  metal: string | null;
  link_pago: string | null;
  pagado_hasta_scu: string | null;
  pagado_hasta_tcu: string | null;
  pagado_hasta_dx: null;
  pagado_hasta_adn: string | null;
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

/**
 * One row of the "Reporte de Notas" report - a NetSuite-native Note attached to a Contrato, date-
 * filtered across EVERY contract (not per-contract like the dossier's Notes tab). Not backed by
 * our synced SQL tables at all - see api/src-ts/reporting/notesReportRepository.ts for why (Notes
 * reject SuiteQL/N-search filtering on their own "attached to" fields in this account), so this
 * always calls NetSuite directly through a RESTlet, same as the per-contract lookup.
 */
export type NotesReportSistema = 'Sistema Anterior' | 'NetSuite';

export interface NotesReportRow {
  contrato: string | null;
  /** The contract's legacy folio (custrecord_cryo_contratosistemaanterior) regardless of which
   * system this row came from - for a "Sistema Anterior" row this is simply its own Folio. */
  folio_sistema_anterior: string | null;
  fecha_creacion: string | null;
  usuario: string | null;
  titulo: string | null;
  nota: string | null;
  /** Which system this note came from - "Sistema Anterior" (pre-NetSuite CryoCell NotasCobranza)
   * or "NetSuite" (NetSuite-native Notes) - confirmed by the user. */
  sistema: NotesReportSistema;
}

export interface NotesReportResponse {
  success: true;
  data: NotesReportRow[];
  /** True when the date range matched more notes than the backend's safety cap could fetch in one
   * request - narrow the range to see the rest. */
  truncated: boolean;
}

/**
 * One row of "Reporte Contratos" - a wide, one-row-per-contract export mirroring a legacy
 * reference spreadsheet's exact column set, sourced entirely from NetSuite. See the file-level
 * comment in api/src-ts/reporting/contratosReportRepository.ts for exactly which column comes
 * from where, and ContratosReportResponse.unavailableColumns for the columns with no confirmed
 * NetSuite source (checked against the full customrecord1184 field list, not merely unchecked).
 */
export interface ContratoReportRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  fecha_alta: string | null;
  estado_contrato: string | null;
  titular_contrato: string | null;
  especimen: string | null;
  titular2: string | null;
  fecha_nacimiento: string | null;
  fecha_procesamiento: string | null;
  vendedor: string | null;
  cobrador_dueno: string | null;
  scu: boolean;
  estado_sangre: string | null;
  costo_anualidad_sangre: number | null;
  pagado_hasta_sangre: string | null;
  tcu: boolean;
  estado_tejido: string | null;
  costo_anualidad_tejido: number | null;
  pagado_hasta_tejido: string | null;
  medico: string | null;
  telefono_titular: string | null;
  correo_titular: string | null;
  zona: string | null;
  subsidiaria: string | null;
  costo_dx: null;
  costo_adn: number | null;
  costo_placenta: number | null;
  mes_nacimiento: number | null;
  telefono_1: string | null;
  telefono_2: string | null;
  telefono_3: string | null;
  telefono_4: string | null;
  telefono_5: string | null;
  telefono_6: string | null;
  telefono_7: string | null;
  telefono_8: string | null;
  telefono_9: string | null;
  telefono_10: string | null;
  correo_titular2: string | null;
  zona_franquicia: string | null;
  tipo: null;
  razon_social: string | null;
  rfc_fac: string | null;
  dir_fac: string | null;
  col_fac: string | null;
  cp_fac: string | null;
  pais_fac: string | null;
  estado_fac: string | null;
  ciudades_fac: string | null;
  usocfdi: string | null;
  regimen_fiscal: string | null;
  referencia_cie: string | null;
  referencia_sap: string | null;
  zona_franquicia_asociado: string | null;
  token: string | null;
  fecha_venta: null;
  estatus_cliente: string | null;
  estatus_cobranza: string | null;
  metal: string | null;
  pago_automatico: boolean | null;
}

export interface ContratosReportResponse {
  success: true;
  data: ContratoReportRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unavailableColumns: Array<{ key: keyof ContratoReportRow; label: string }>;
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

/** Response from POST /reports/logistica/ticket - see api/src-ts/reporting/logisticaTicketController.ts. */
export interface LogisticaTicketResponse {
  success: true;
  ticket: string;
  message: string;
}

export interface ApiError {
  success: false;
  message: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
