import { apiFetch, apiFetchBlob } from './apiClient';
import type {
  AdminUserSummary,
  ApiSuccess,
  ChargeDomiciledRequest,
  ChargeDomiciledResponse,
  ComercialReportResponse,
  CobranzaCommissionContractGroup,
  CobranzaCommissionsResponse,
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
  LogisticaTicketResponse,
  MarketingReportResponse,
  NetSuiteNote,
  NotaCobranza,
  NotesReportResponse,
  NotesReportRow,
  PaginatedRows,
  PartidaAnalyticsResponse,
  PartidaBreakdownRow,
  PartidaDimension,
  PaymentRow,
  PostventaAsuntoRow,
  PostventaByAsuntoResponse,
  PostventaByMonthResponse,
  PostventaMonthRow,
  PostventaOwnerOption,
  PostventaOwnersResponse,
  PostventaResueltoMonthRow,
  PostventaResueltosByMonthResponse,
  PostventaSummary,
  PostventaSummaryResponse,
  PostventaTicketRow,
  PostventaTicketsResponse,
  ProspectoRow,
  ProspectosResponse,
  ReembolsoByCausaResponse,
  ReembolsoByMonthResponse,
  ReembolsoCausaRow,
  ReembolsoCerradosByMonthResponse,
  ReembolsoCierreMonthRow,
  ReembolsoEmpresaOption,
  ReembolsoEmpresasResponse,
  ReembolsoMonthRow,
  ReembolsoRow,
  ReembolsosResponse,
  TareaVencidaRow,
  TareaVencidaVendedoresResponse,
  TareaVendedorOption,
  TareasVencidasByMonthResponse,
  TareasVencidasResponse,
  CuentaRow,
  CuentasResponse,
  ContratoReportRow,
  ContratosReportResponse,
  ReportEntityKey,
  ReportRecord,
  SortDir,
  UpdateContractInput,
  UserPermissionUpdate,
  VendedorCommissionGroup,
  VendedorOption,
  ZammadTicketsByMonthResponse,
  ZammadTicketsMonthRow,
} from './types';

export interface EntitiesResult {
  entities: EntitySummary[];
  isAdmin: boolean;
  canAccessHr: boolean;
  canAccessCommissions: boolean;
  canAccessProspectos: boolean;
  canAccessCobranzaCommissions: boolean;
  canAccessPostventa: boolean;
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
    canAccessCobranzaCommissions: result.canAccessCobranzaCommissions,
    canAccessPostventa: result.canAccessPostventa,
  };
}

export interface PostventaFiltersParams {
  dateFrom?: string;
  dateTo?: string;
  ownerId?: string;
}

function postventaQueryParams(params: PostventaFiltersParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  if (params.ownerId) query.set('ownerId', params.ownerId);
  return query;
}

/** Postventa status tiles (new/en proceso/cerrado/resuelto) - see
 * api/src-ts/reporting/postventaRepository.ts. */
export async function fetchPostventaSummary(token: string | null, params: PostventaFiltersParams): Promise<PostventaSummary> {
  const query = postventaQueryParams(params);
  const result = await apiFetch<PostventaSummaryResponse>(`/reports/postventa/summary?${query.toString()}`, { token });
  return result.data;
}

/** Distinct real owners (never the unassigned sentinel) for the Postventa owner filter dropdown. */
export async function fetchPostventaOwners(token: string | null): Promise<PostventaOwnerOption[]> {
  const result = await apiFetch<PostventaOwnersResponse>('/reports/postventa/owners', { token });
  return result.data;
}

/** The four counts per (año, mes) of created_at_zammad, for the Postventa status-by-month chart. */
export async function fetchPostventaByMonth(token: string | null, params: PostventaFiltersParams): Promise<PostventaMonthRow[]> {
  const query = postventaQueryParams(params);
  const result = await apiFetch<PostventaByMonthResponse>(`/reports/postventa/by-month?${query.toString()}`, { token });
  return result.data;
}

/** Ticket counts per normalized asunto across the filtered range, for the Postventa by-asunto chart. */
export async function fetchPostventaByAsunto(token: string | null, params: PostventaFiltersParams): Promise<PostventaAsuntoRow[]> {
  const query = postventaQueryParams(params);
  const result = await apiFetch<PostventaByAsuntoResponse>(`/reports/postventa/by-asunto?${query.toString()}`, { token });
  return result.data;
}

/** Resuelto-state ticket counts per (año, mes) of their own "fecha resuelto" (close_at_zammad), for
 * the Postventa resolution-volume chart. */
export async function fetchPostventaResueltosByMonth(token: string | null, params: PostventaFiltersParams): Promise<PostventaResueltoMonthRow[]> {
  const query = postventaQueryParams(params);
  const result = await apiFetch<PostventaResueltosByMonthResponse>(`/reports/postventa/resueltos-by-month?${query.toString()}`, { token });
  return result.data;
}

export interface PostventaTicketsParams extends PostventaFiltersParams {
  page: number;
  pageSize: number;
}

export interface PostventaTicketsResult {
  data: PostventaTicketRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The Postventa detail table - see api/src-ts/reporting/postventaRepository.ts. */
export async function fetchPostventaTickets(token: string | null, params: PostventaTicketsParams): Promise<PostventaTicketsResult> {
  const query = postventaQueryParams(params);
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));
  const result = await apiFetch<PostventaTicketsResponse>(`/reports/postventa/tickets?${query.toString()}`, { token });
  return { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages };
}

/** CSV of every matching Postventa ticket in the filtered range (unpaginated), same convention as
 * fetchTareasVencidasExportCsv. */
export async function fetchPostventaExportCsv(token: string | null, params: PostventaFiltersParams): Promise<Blob> {
  const query = postventaQueryParams(params);
  return apiFetchBlob(`/reports/postventa/export?${query.toString()}`, { token });
}

export interface ReembolsoFiltersParams {
  anio: number;
  empresaId?: string;
}

function reembolsoQueryParams(params: ReembolsoFiltersParams): URLSearchParams {
  const query = new URLSearchParams({ anio: String(params.anio) });
  if (params.empresaId) query.set('empresaId', params.empresaId);
  return query;
}

/** Every empresa with at least one Reembolso on file, for the Reembolsos filter dropdown - see
 * api/src-ts/reporting/reembolsosRepository.ts. */
export async function fetchReembolsoEmpresas(token: string | null): Promise<ReembolsoEmpresaOption[]> {
  const result = await apiFetch<ReembolsoEmpresasResponse>('/reports/postventa/reembolsos/empresas', { token });
  return result.data;
}

/** Monto per (mes, bucket) for the Reembolsos by-month chart. */
export async function fetchReembolsosByMonth(token: string | null, params: ReembolsoFiltersParams): Promise<ReembolsoMonthRow[]> {
  const query = reembolsoQueryParams(params);
  const result = await apiFetch<ReembolsoByMonthResponse>(`/reports/postventa/reembolsos/by-month?${query.toString()}`, { token });
  return result.data;
}

/** Monto per causa de reembolso for the Reembolsos by-causa chart. */
export async function fetchReembolsosByCausa(token: string | null, params: ReembolsoFiltersParams): Promise<ReembolsoCausaRow[]> {
  const query = reembolsoQueryParams(params);
  const result = await apiFetch<ReembolsoByCausaResponse>(`/reports/postventa/reembolsos/by-causa?${query.toString()}`, { token });
  return result.data;
}

/** Count + monto of closed reembolsos per (año, mes) of their own fecha cierre, for the Reembolsos
 * Cerrados por Mes chart. */
export async function fetchReembolsosCerradosByMonth(token: string | null, params: ReembolsoFiltersParams): Promise<ReembolsoCierreMonthRow[]> {
  const query = reembolsoQueryParams(params);
  const result = await apiFetch<ReembolsoCerradosByMonthResponse>(`/reports/postventa/reembolsos/cerrados-by-month?${query.toString()}`, { token });
  return result.data;
}

export interface ReembolsosParams extends ReembolsoFiltersParams {
  page: number;
  pageSize: number;
}

export interface ReembolsosResult {
  data: ReembolsoRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The Reembolsos detail table - see api/src-ts/reporting/reembolsosRepository.ts. */
export async function fetchReembolsos(token: string | null, params: ReembolsosParams): Promise<ReembolsosResult> {
  const query = reembolsoQueryParams(params);
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));
  const result = await apiFetch<ReembolsosResponse>(`/reports/postventa/reembolsos?${query.toString()}`, { token });
  return { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages };
}

/** CSV of every matching Reembolso in the filtered año (unpaginated), same convention as
 * fetchPostventaExportCsv. */
export async function fetchReembolsosExportCsv(token: string | null, params: ReembolsoFiltersParams): Promise<Blob> {
  const query = reembolsoQueryParams(params);
  return apiFetchBlob(`/reports/postventa/reembolsos/export?${query.toString()}`, { token });
}

export interface ZammadTicketsFiltersParams {
  dateFrom?: string;
  dateTo?: string;
}

/** Zammad Tickets by-month chart (all groups) - creados/primeraAtencion/cerrados counts per
 * (año, mes). See api/src-ts/reporting/zammadTicketsAnalyticsRepository.ts. */
export async function fetchZammadTicketsByMonth(token: string | null, params: ZammadTicketsFiltersParams): Promise<ZammadTicketsMonthRow[]> {
  const query = new URLSearchParams();
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  const result = await apiFetch<ZammadTicketsByMonthResponse>(`/reports/zammad-tickets/by-month?${query.toString()}`, { token });
  return result.data;
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

/** Creates a Zammad ticket for one Logística request - `formData` carries marca, tipoSolicitud,
 * campos (JSON-stringified dynamic subform values), comentarios and attachment[] files. No
 * Content-Type header is set here on purpose - the browser fills in the multipart boundary itself
 * when the body is a FormData instance. */
export async function submitLogisticaTicket(token: string | null, formData: FormData): Promise<{ ticket: string; message: string }> {
  const result = await apiFetch<LogisticaTicketResponse>('/reports/logistica/ticket', {
    token,
    method: 'POST',
    body: formData,
  });
  return { ticket: result.ticket, message: result.message };
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
  /** False only for a full-access caller without 'commissions_amounts' - every dollar figure in
   * `groups` is then null. Always true for a self-vendedor. */
  canSeeAmounts: boolean;
}

/** CSV of the same commissions grid fetchCommissions returns, flattened to one row per
 * contract/otros-contrato (see api/src-ts/reporting/commissionsExport.ts) - same auth/scoping, so
 * a self-vendedor's export contains only their own rows too. */
export async function fetchCommissionsExportCsv(
  token: string | null,
  month: number,
  year: number,
  subsidiary?: string[],
  currency?: string,
  vendedor?: string
): Promise<Blob> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  if (subsidiary && subsidiary.length > 0) query.set('subsidiary', subsidiary.join(','));
  if (currency) query.set('currency', currency);
  if (vendedor) query.set('vendedor', vendedor);
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
  currency?: string,
  vendedor?: string
): Promise<Blob> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  if (subsidiary && subsidiary.length > 0) query.set('subsidiary', subsidiary.join(','));
  if (currency) query.set('currency', currency);
  if (vendedor) query.set('vendedor', vendedor);
  return apiFetchBlob(`/reports/contracts/commissions/pdf?${query.toString()}`, { token });
}

/** Customer-facing "Estado de Cuenta" PDF for a single contract - see
 * api/src-ts/reporting/estadoCuentaPdf.ts. */
export async function fetchEstadoCuentaPdf(token: string | null, contractId: string): Promise<Blob> {
  return apiFetchBlob(`/reports/contracts/${encodeURIComponent(contractId)}/estado-cuenta`, { token });
}

/** New-contract salesperson commissions grid for one calendar month, optionally narrowed to one or
 * more subsidiaries, a currency, and/or (full-access callers only - ignored for a self-vendedor,
 * who's already scoped to just themselves) one vendedor. */
export async function fetchCommissions(
  token: string | null,
  month: number,
  year: number,
  subsidiary?: string[],
  currency?: string,
  vendedor?: string
): Promise<CommissionsResult> {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  if (subsidiary && subsidiary.length > 0) query.set('subsidiary', subsidiary.join(','));
  if (currency) query.set('currency', currency);
  if (vendedor) query.set('vendedor', vendedor);
  const result = await apiFetch<CommissionsResponse>(`/reports/contracts/commissions?${query.toString()}`, { token });
  return { groups: result.data, isSelfVendedor: result.isSelfVendedor, canSeeAmounts: result.canSeeAmounts };
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

/** "Reporte de Marketing" - sales-by-month (online/offline split) + prospecto qualification
 * funnel, built on the same Prospecto data as fetchProspectos - see
 * api/src-ts/reporting/marketingRepository.ts. */
export async function fetchMarketingReport(token: string | null, dateFrom: string, dateTo: string): Promise<MarketingReportResponse> {
  const query = new URLSearchParams({ dateFrom, dateTo });
  return apiFetch<MarketingReportResponse>(`/reports/marketing?${query.toString()}`, { token });
}

/** "Comercial" - tareas-per-prospecto distribution, global and per vendedor - see
 * api/src-ts/reporting/comercialRepository.ts. */
export async function fetchComercialReport(token: string | null, dateFrom: string, dateTo: string): Promise<ComercialReportResponse> {
  const query = new URLSearchParams({ dateFrom, dateTo });
  return apiFetch<ComercialReportResponse>(`/reports/comercial?${query.toString()}`, { token });
}

export interface TareasVencidasParams {
  dateFrom: string;
  dateTo: string;
  /** Underlying raw Vendedor ids a merged dropdown entry maps to - see
   * web/src/utils/comercial.ts's normalizeVendedorName. Empty/omitted means every vendedor. */
  vendedorIds: number[];
  page: number;
  pageSize: number;
  /** The Comercial page's Activos/Todos switch, applied here too - filters to Tarea.Activo = true. */
  activoOnly: boolean;
}

export interface TareasVencidasResult {
  data: TareaVencidaRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function tareasVencidasQueryParams(
  params: Pick<TareasVencidasParams, 'dateFrom' | 'dateTo' | 'vendedorIds' | 'activoOnly'>,
): URLSearchParams {
  const query = new URLSearchParams({ dateFrom: params.dateFrom, dateTo: params.dateTo });
  if (params.vendedorIds.length > 0) query.set('vendedorIds', params.vendedorIds.join(','));
  if (params.activoOnly) query.set('activo', '1');
  return query;
}

/** "Tareas Vencidas" - overdue, never-properly-closed Tarea rows - see
 * api/src-ts/reporting/tareasVencidasRepository.ts. */
export async function fetchTareasVencidas(token: string | null, params: TareasVencidasParams): Promise<TareasVencidasResult> {
  const query = tareasVencidasQueryParams(params);
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));
  const result = await apiFetch<TareasVencidasResponse>(`/reports/comercial/tareas-vencidas?${query.toString()}`, { token });
  return { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages };
}

/** Distinct (id_vendedor, vendedor) pairs for the Tareas Vencidas vendedor filter dropdown. */
export async function fetchTareaVencidaVendedores(token: string | null, dateFrom: string, dateTo: string): Promise<TareaVendedorOption[]> {
  const query = new URLSearchParams({ dateFrom, dateTo });
  const result = await apiFetch<TareaVencidaVendedoresResponse>(`/reports/comercial/tareas-vencidas/vendedores?${query.toString()}`, { token });
  return result.data;
}

/** CSV of every matching Tarea in the filtered range (unpaginated), same convention as fetchProspectosExportCsv. */
export async function fetchTareasVencidasExportCsv(
  token: string | null,
  params: Pick<TareasVencidasParams, 'dateFrom' | 'dateTo' | 'vendedorIds' | 'activoOnly'>,
): Promise<Blob> {
  const query = tareasVencidasQueryParams(params);
  return apiFetchBlob(`/reports/comercial/tareas-vencidas/export?${query.toString()}`, { token });
}

/** Counts grouped by (año, mes), globally and per vendedor, for the Tareas Vencidas global/por-
 * vendedor charts - always unfiltered by vendedor, see getTareasVencidasByMonthRoute. */
export async function fetchTareasVencidasByMonth(
  token: string | null,
  dateFrom: string,
  dateTo: string,
  activoOnly: boolean,
): Promise<Pick<TareasVencidasByMonthResponse, 'global' | 'porVendedor'>> {
  const query = new URLSearchParams({ dateFrom, dateTo });
  if (activoOnly) query.set('activo', '1');
  const result = await apiFetch<TareasVencidasByMonthResponse>(`/reports/comercial/tareas-vencidas/by-month?${query.toString()}`, { token });
  return { global: result.global, porVendedor: result.porVendedor };
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

function buildCobranzaCommissionsQuery(month: number, year: number, subsidiary?: string[]): URLSearchParams {
  const query = new URLSearchParams({ month: String(month), year: String(year) });
  if (subsidiary && subsidiary.length > 0) query.set('subsidiary', subsidiary.join(','));
  return query;
}

export interface CobranzaCommissionsResult {
  data: CobranzaCommissionContractGroup[];
  month: number;
  year: number;
}

/** Cobranza Commissions - which partidas got paid this month, grouped by contract/año - reached
 * from the Partidas report, see api/src-ts/reporting/cobranzaCommissionsRepository.ts. */
export async function fetchCobranzaCommissions(
  token: string | null,
  month: number,
  year: number,
  subsidiary?: string[]
): Promise<CobranzaCommissionsResult> {
  const query = buildCobranzaCommissionsQuery(month, year, subsidiary);
  const result = await apiFetch<CobranzaCommissionsResponse>(`/reports/cobranza-comisiones?${query.toString()}`, { token });
  return { data: result.data, month: result.month, year: result.year };
}

/** CSV of the same cobranza commissions data fetchCobranzaCommissions returns, one row per partida. */
export async function fetchCobranzaCommissionsExportCsv(
  token: string | null,
  month: number,
  year: number,
  subsidiary?: string[]
): Promise<Blob> {
  const query = buildCobranzaCommissionsQuery(month, year, subsidiary);
  return apiFetchBlob(`/reports/cobranza-comisiones/export?${query.toString()}`, { token });
}

export interface NotesReportResult {
  data: NotesReportRow[];
  truncated: boolean;
}

/** "Reporte de Notas" - every NetSuite-native Note attached to a Contrato whose own date falls
 * within [dateFrom, dateTo] ("YYYY-MM-DD"), across every contract - see
 * api/src-ts/reporting/notesReportRepository.ts. Not paginated on our side - the backend already
 * bounds how much it fetches per request (see `truncated`). */
export async function fetchNotesReport(token: string | null, dateFrom: string, dateTo: string): Promise<NotesReportResult> {
  const query = new URLSearchParams({ dateFrom, dateTo });
  const result = await apiFetch<NotesReportResponse>(`/reports/notas?${query.toString()}`, { token });
  return { data: result.data, truncated: result.truncated };
}

/** CSV of the same notes report (unpaginated - the whole filtered set), same convention as fetchProspectosExportCsv. */
export async function fetchNotesReportExportCsv(token: string | null, dateFrom: string, dateTo: string): Promise<Blob> {
  const query = new URLSearchParams({ dateFrom, dateTo });
  return apiFetchBlob(`/reports/notas/export?${query.toString()}`, { token });
}

export interface ContratosReportParams {
  page: number;
  pageSize: number;
  search: string;
  subsidiary: string[];
}

export interface ContratosReportResult {
  data: ContratoReportRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unavailableColumns: Array<{ key: keyof ContratoReportRow; label: string }>;
}

function buildContratosReportQuery(
  params: Pick<ContratosReportParams, 'search' | 'subsidiary'> & Partial<Pick<ContratosReportParams, 'page' | 'pageSize'>>,
): URLSearchParams {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  if (params.subsidiary.length > 0) query.set('subsidiary', params.subsidiary.join(','));
  return query;
}

/** "Reporte Contratos" - wide per-contract export - see api/src-ts/reporting/contratosReportRepository.ts. */
export async function fetchContratosReport(token: string | null, params: ContratosReportParams): Promise<ContratosReportResult> {
  const query = buildContratosReportQuery(params);
  const result = await apiFetch<ContratosReportResponse>(`/reports/contratos-report?${query.toString()}`, { token });
  return {
    data: result.data,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    unavailableColumns: result.unavailableColumns,
  };
}

/** CSV of every contrato matching the current search/subsidiary filters (unpaginated - the whole filtered set). */
export async function fetchContratosReportExportCsv(token: string | null, params: Pick<ContratosReportParams, 'search' | 'subsidiary'>): Promise<Blob> {
  const query = buildContratosReportQuery(params);
  return apiFetchBlob(`/reports/contratos-report/export?${query.toString()}`, { token });
}
