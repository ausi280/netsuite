import { apiFetch } from './apiClient';
import type {
  AdminUserSummary,
  ApiSuccess,
  EntitiesResponse,
  EntitySummary,
  PaginatedRows,
  PartidaAnalyticsResponse,
  PartidaBreakdownRow,
  PartidaDimension,
  ReportEntityKey,
  ReportRecord,
  SortDir,
  UserPermissionUpdate,
} from './types';

export interface EntitiesResult {
  entities: EntitySummary[];
  isAdmin: boolean;
}

export interface EntityRowsParams {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: SortDir;
  subsidiary: string;
}

export async function fetchEntities(token: string | null): Promise<EntitiesResult> {
  const result = await apiFetch<EntitiesResponse>('/reports/entities', { token });
  return { entities: result.data, isAdmin: result.isAdmin };
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
  if (params.subsidiary) query.set('subsidiary', params.subsidiary);

  return apiFetch<PaginatedRows>(`/reports/${entityKey}?${query.toString()}`, { token });
}

/** Distinct subsidiary ids for this entity's filter dropdown - empty for entities with no subsidiary column synced. */
export async function fetchSubsidiaryOptions(token: string | null, entityKey: ReportEntityKey): Promise<string[]> {
  const result = await apiFetch<ApiSuccess<string[]>>(`/reports/${entityKey}/subsidiaries`, { token });
  return result.data;
}

/** Aggregated count+sum breakdown for the partidas graphs page. Only 'partidas' supports this today. */
export async function fetchPartidaAnalytics(
  token: string | null,
  dimension: PartidaDimension
): Promise<PartidaBreakdownRow[]> {
  const result = await apiFetch<PartidaAnalyticsResponse>(`/reports/partidas/analytics?dimension=${dimension}`, {
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
