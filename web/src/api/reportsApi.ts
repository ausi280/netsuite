import { apiFetch } from './apiClient';
import type { ApiSuccess, EntitySummary, PaginatedRows, ReportEntityKey, ReportRecord, SortDir } from './types';

export interface EntityRowsParams {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: SortDir;
  subsidiary: string;
}

export async function fetchEntities(token: string | null): Promise<EntitySummary[]> {
  const result = await apiFetch<ApiSuccess<EntitySummary[]>>('/reports/entities', { token });
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
  if (params.subsidiary) query.set('subsidiary', params.subsidiary);

  return apiFetch<PaginatedRows>(`/reports/${entityKey}?${query.toString()}`, { token });
}

/** Distinct subsidiary ids for this entity's filter dropdown - empty for entities with no subsidiary column synced. */
export async function fetchSubsidiaryOptions(token: string | null, entityKey: ReportEntityKey): Promise<string[]> {
  const result = await apiFetch<ApiSuccess<string[]>>(`/reports/${entityKey}/subsidiaries`, { token });
  return result.data;
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
