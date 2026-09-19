import { apiFetch, apiFetchBlob } from './apiClient';
import type {
  AdminUserSummary,
  ApiSuccess,
  ChargeDomiciledRequest,
  ChargeDomiciledResponse,
  CommissionLevelTier,
  CommissionsResponse,
  ContractDossier,
  ContractNotasResponse,
  EmployeeLevel,
  EntitiesResponse,
  EntitySummary,
  HrAnalyticsResponse,
  HrBreakdownRow,
  HrDimension,
  HrSummary,
  HrSummaryResponse,
  ContractNetSuiteNotesResponse,
  NetSuiteNote,
  NotaCobranza,
  PaginatedRows,
  PartidaAnalyticsResponse,
  PartidaBreakdownRow,
  PartidaDimension,
  PaymentRow,
  ProspectoRow,
  ProspectosResponse,
  CuentaRow,
  CuentasResponse,
  ReportEntityKey,
  ReportRecord,
  SortDir,
  UpdateContractInput,
  UserPermissionUpdate,
  VendedorCommissionGroup,
  VendedorOption,
} from './types';

export interface EntitiesResult {
  entities: EntitySummary[];
  isAdmin: boolean;
  canAccessHr: boolean;
  canAccessCommissions: boolean;
  canAccessProspectos: boolean;
}

export interface EntityRowsParams {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: SortDir;
  /** Zero or more subsidiary ids (OR'd) - sent as one comma-separated query param. */
  subsidiary: string[];
  /** Partidas-only status filter (custrecord_cryo_estatuspartida) - ignored by every other entity. */
  estatus?: string;
  /** vendor-transactions-only: narrows to one vendor's rows (the per-vendor drill-down view) - ignored by every other entity. */
  vendorId?: string;
}

export async function fetchEntities(token: string | null): Promise<EntitiesResult> {
  const result = await apiFetch<EntitiesResponse>('/reports/entities', { token });
  return {
    entities: result.data,
    isAdmin: result.isAdmin,
    canAccessHr: result.canAccessHr,
    canAccessCommissions: result.canAccessCommissions,
    canAccessProspectos: result.canAccessProspectos,
  };
}

export async function fetchEntityRows(
  token: string | null,
  entityKey: ReportEntityKey,
  params: EntityRowsParams
): Promise<PaginatedRows> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortDir) query.set('sortDir', params.sortDir);
  if (params.subsidiary.length > 0) query.set('subsidiary', params.subsidiary.join(','));
  if (params.estatus) query.set('estatus', params.estatus);
  if (params.vendorId) query.set('vendorId', params.vendorId);

  return apiFetch<PaginatedRows>(`/reports/${entityKey}?${query.toString()}`, { token });
}

export interface EntityExportParams {
  search: string;
  sortBy: string;
  sortDir: SortDir;
  subsidiary: string[];
  estatus?: string;
  vendorId?: string;
}

/** CSV of every row matching the current search/subsidiary/sort filters (unpaginated - the whole filtered set). */
export async function fetchEntityExportCsv(
  token: string | null,
  entityKey: ReportEntityKey,
  params: EntityExportParams
): Promise<Blob> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortDir) query.set('sortDir', params.sortDir);
  if (params.subsidiary.length > 0) query.set('subsidiary', params.subsidiary.join(','));
  if (params.estatus) query.set('estatus', params.estatus);
  if (params.vendorId) query.set('vendorId', params.vendorId);

  return apiFetchBlob(`/reports/${entityKey}/export?${query.toString()}`, { token });
}

/** Distinct subsidiary ids for this entity's filter dropdown - empty for entities with no subsidiary column synced. */
export async function fetchSubsidiaryOptions(token: string | null, entityKey: ReportEntityKey): Promise<string[]> {
  const result = await apiFetch<ApiSuccess<string[]>>(`/reports/${entityKey}/subsidiaries`, { token });
  return result.data;
}

/** Aggregated count+sum breakdown for the partidas graphs page, grouped by dimension AND currency
 * (this account mixes MXN/USD/EUR/COP/ARS/PEN/BRL). Only 'partidas' supports this today. */
export async function fetchPartidaAnalytics(
  token: string | null,
  dimension: PartidaDimension
): Promise<PartidaBreakdownRow[]> {
  const result = await apiFetch<PartidaAnalyticsResponse>(`/reports/partidas/analytics?dimension=${dimension}`, {
    token,
  });
  return result.data;
}

/** Admin-only: total/active/inactive headcount from the Peopleforce/Sesame HR data warehouse. 403s for a non-admin caller. */
export async function fetchHrSummary(token: string | null): Promise<HrSummary> {
  const result = await apiFetch<HrSummaryResponse>('/reports/hr/summary', { token });
  return result.data;
}

/** Admin-only: headcount grouped by one HR dimension - see HrDimension for the supported set. */
export async function fetchHrAnalytics(token: string | null, dimension: HrDimension, activeOnly: boolean): Promise<HrBreakdownRow[]> {
  const result = await apiFetch<HrAnalyticsResponse>(`/reports/hr/analytics?dimension=${dimension}&activeOnly=${activeOnly}`, {
    token,
  });
  return result.data;
}

/** Admin-only: every registered user (auto-provisioned on first login) and their current access. 403s for a non-admin caller. */
export async function fetchAdminUsers(token: string | null): Promise<AdminUserSummary[]> {
  const result = await apiFetch<ApiSuccess<AdminUserSummary[]>>('/reports/admin/users', { token });
  return result.data;
}

/** Admin-only: overwrites one user's isAdmin/allowedEntities/allowedSubsidiaries. */
export async function updateAdminUserPermissions(token: string | null, oid: string, update: UserPermissionUpdate): Promise<void> {
  await apiFetch(`/reports/admin/users/${encodeURIComponent(oid)}`, {
    token,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
}

/** Rich single-contract view (resolved names, its services, its annuities/partidas). */
export async function fetchContractDossier(token: string | null, id: string): Promise<ContractDossier> {
  const result = await apiFetch<ApiSuccess<ContractDossier>>(`/reports/contracts/${encodeURIComponent(id)}/dossier`, { token });
  return result.data;
}

/** Every employee (id + name), for the "Vendedor" edit field's picker. */
export async function fetchVendedorOptions(token: string | null): Promise<VendedorOption[]> {
  const result = await apiFetch<ApiSuccess<VendedorOption[]>>('/reports/contracts/vendedores', { token });
  return result.data;
}

/** Edits custrecord_cryo_contratosistemaanterior and/or custrecord_cryo_vendedor - writes to
 * NetSuite first, then mirrors into the local DB (see contractEditController.ts). */
export async function updateContract(token: string | null, id: string, input: UpdateContractInput): Promise<void> {
  await apiFetch(`/reports/contracts/${encodeURIComponent(id)}`, {
    token,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface CommissionsResult {
  groups: VendedorCommissionGroup[];
  /** True when the caller is a "self-vendedor" (see EntitiesResult.canAccessCommissions) - the
   * response is scoped to their own sales only, never every vendedor's. */
  isSelfVendedor: boolean;
}

/** CSV of the same commissions grid fetchCommissions returns, flattened to one row per
 * contract/otros-contrato (see api/src-ts/reporting/commissionsExport.ts) - same auth/scoping, so
 * a self-vendedor's export contains only their own rows too. */
export async function fetchCommissionsExportCsv(
  token: string | null,
  month: number,
  year: number,
  subsidiary?: string[],
  currency?: string
): Promise<Blob> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  if (subsidiary && subsidiary.length > 0) query.set('subsidiary', subsidiary.join(','));
  if (currency) query.set('currency', currency);
  return apiFetchBlob(`/reports/contracts/commissions/export?${query.toString()}`, { token });
}

/** "Estado de cuenta de Comisiones" PDF for the same commissions grid, one page per vendedor (see
 * api/src-ts/reporting/commissionsPdf.ts) - same auth/scoping, so a self-vendedor's PDF has
 * exactly their own single page. */
export async function fetchCommissionsPdf(
  token: string | null,
  month: number,
  year: number,
  subsidiary?: string[],
  currency?: string
): Promise<Blob> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  if (subsidiary && subsidiary.length > 0) query.set('subsidiary', subsidiary.join(','));
  if (currency) query.set('currency', currency);
  return apiFetchBlob(`/reports/contracts/commissions/pdf?${query.toString()}`, { token });
}

/** New-contract salesperson commissions grid for one calendar month, optionally narrowed to one or
 * more subsidiaries and/or a currency. */
export async function fetchCommissions(
  token: string | null,
  month: number,
  year: number,
  subsidiary?: string[],
  currency?: string
): Promise<CommissionsResult> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  if (subsidiary && subsidiary.length > 0) query.set('subsidiary', subsidiary.join(','));
  if (currency) query.set('currency', currency);
  const result = await apiFetch<CommissionsResponse>(`/reports/contracts/commissions?${query.toString()}`, { token });
  return { groups: result.data, isSelfVendedor: result.isSelfVendedor };
}

/** Collection-call notes from the pre-NetSuite CryoCell system (NotasCobranza), keyed off the
 * contract's legacy folio. `folio: null` in the result means this contract was created directly
 * in NetSuite and has no legacy history. */
export async function fetchContractNotas(token: string | null, id: string): Promise<{ notas: NotaCobranza[]; folio: string | null }> {
  const result = await apiFetch<ContractNotasResponse>(`/reports/contracts/${encodeURIComponent(id)}/notas`, { token });
  return { notas: result.data, folio: result.folio };
}

/** NetSuite-native notes (the note.nl UI page) for a contract, via the "Get notes" RESTlet. */
export async function fetchContractNetSuiteNotes(token: string | null, id: string): Promise<NetSuiteNote[]> {
  const result = await apiFetch<ContractNetSuiteNotesResponse>(`/reports/contracts/${encodeURIComponent(id)}/netsuite-notes`, { token });
  return result.data;
}

export interface PaymentsListParams {
  page: number;
  pageSize: number;
  search: string;
  /** The NetSuite subsidiary id(s) of the payment's linked contract - not payloadRequest's own copy. */
  subsidiary?: string[];
  /** Both "YYYY-MM-DD" - filters on the payment's created_at, inclusive of the entire dateTo day. */
  dateFrom?: string;
  dateTo?: string;
}

/** Payments grid rows - a dedicated fetcher (not fetchEntityRows) since this list has no sort, just
 * page/pageSize/search/subsidiary/date-range. */
export async function fetchPaymentsList(token: string | null, params: PaymentsListParams): Promise<PaginatedRows<PaymentRow>> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) query.set('search', params.search);
  if (params.subsidiary && params.subsidiary.length > 0) query.set('subsidiary', params.subsidiary.join(','));
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);

  return apiFetch<PaginatedRows<PaymentRow>>(`/reports/payments?${query.toString()}`, { token });
}

/** Proxies the "cobro domiciliado" action to the live payment.cryoholdco.com API through our own
 * backend - this app never talks to MercadoPago/that API directly. */
export async function chargeDomiciled(token: string | null, body: ChargeDomiciledRequest): Promise<ChargeDomiciledResponse> {
  return apiFetch<ChargeDomiciledResponse>('/reports/payments/charge-domiciled', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Every employee with their currently assigned commission nivel (A/B/C/...), for the "assign
 * niveles" admin screen. */
export async function fetchEmployeeLevels(token: string | null): Promise<EmployeeLevel[]> {
  const result = await apiFetch<ApiSuccess<EmployeeLevel[]>>('/reports/commission-levels/employees', { token });
  return result.data;
}

export interface EmployeeLevelsInput {
  nivel_contratos: string | null;
  nivel_otros_contratos: string | null;
}

/** Assigns (or clears, with null) both of one employee's niveles at once - Contratos and Otros
 * Contratos sales don't sum together for tier resolution, so each has its own nivel. */
export async function updateEmployeeLevel(token: string | null, employeeId: string, input: EmployeeLevelsInput): Promise<void> {
  await apiFetch('/reports/commission-levels/employees/' + encodeURIComponent(employeeId), {
    token,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Every nivel's commission-rate tiers, for the "configure niveles" admin screen. */
export async function fetchCommissionTiers(token: string | null): Promise<CommissionLevelTier[]> {
  const result = await apiFetch<ApiSuccess<CommissionLevelTier[]>>('/reports/commission-levels/tiers', { token });
  return result.data;
}

export interface UpsertCommissionTierInput {
  /** Omit to create a new tier; provide to edit an existing one. */
  id?: number;
  nivel: string;
  min_amount: number;
  percentage: number;
}

export async function upsertCommissionTier(token: string | null, input: UpsertCommissionTierInput): Promise<void> {
  await apiFetch('/reports/commission-levels/tiers', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteCommissionTier(token: string | null, id: number): Promise<void> {
  await apiFetch(`/reports/commission-levels/tiers/${id}`, { token, method: 'DELETE' });
}

export async function fetchEntityRecord(
  token: string | null,
  entityKey: ReportEntityKey,
  id: string
): Promise<ReportRecord> {
  const result = await apiFetch<ApiSuccess<ReportRecord>>(
    `/reports/${entityKey}/${encodeURIComponent(id)}`,
    { token }
  );
  return result.data;
}

export interface ProspectosParams {
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
}

export interface ProspectosResult {
  data: ProspectoRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** "Prospectos" CRM lead-funnel report - see api/src-ts/reporting/prospectosRepository.ts. */
export async function fetchProspectos(token: string | null, params: ProspectosParams): Promise<ProspectosResult> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  const result = await apiFetch<ProspectosResponse>(`/reports/prospectos?${query.toString()}`, { token });
  return { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages };
}

/** CSV of every prospecto captured in the date range (unpaginated - the whole filtered set), same convention as fetchEntityExportCsv. */
export async function fetchProspectosExportCsv(token: string | null, dateFrom: string, dateTo: string): Promise<Blob> {
  const query = new URLSearchParams({ dateFrom, dateTo });
  return apiFetchBlob(`/reports/prospectos/export?${query.toString()}`, { token });
}

export interface CuentasParams {
  page: number;
  pageSize: number;
  search: string;
  subsidiary: string[];
}

export interface CuentasResult {
  data: CuentaRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unavailableColumns: Array<{ key: keyof CuentaRow; label: string }>;
}

function buildCuentasQuery(params: Pick<CuentasParams, 'search' | 'subsidiary'> & Partial<Pick<CuentasParams, 'page' | 'pageSize'>>): URLSearchParams {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  if (params.subsidiary.length > 0) query.set('subsidiary', params.subsidiary.join(','));
  return query;
}

/** "Cuentas" per-contract account/collections detail sheet, reached from the Partidas report -
 * see api/src-ts/reporting/cuentasRepository.ts. */
export async function fetchCuentas(token: string | null, params: CuentasParams): Promise<CuentasResult> {
  const query = buildCuentasQuery(params);
  const result = await apiFetch<CuentasResponse>(`/reports/cuentas?${query.toString()}`, { token });
  return {
    data: result.data,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    unavailableColumns: result.unavailableColumns,
  };
}

/** CSV of every cuenta matching the current search/subsidiary filters (unpaginated - the whole filtered set). */
export async function fetchCuentasExportCsv(token: string | null, params: Pick<CuentasParams, 'search' | 'subsidiary'>): Promise<Blob> {
  const query = buildCuentasQuery(params);
  return apiFetchBlob(`/reports/cuentas/export?${query.toString()}`, { token });
}
