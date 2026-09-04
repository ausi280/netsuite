import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchEntityRows, type EntityRowsParams } from '../api/reportsApi';
import type { ReportEntityKey } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

interface UseEntityRowsOptions {
  enabled?: boolean;
}

export function useEntityRows(
  entityKey: ReportEntityKey,
  params: EntityRowsParams,
  options: UseEntityRowsOptions = {}
) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: [
      'report',
      entityKey,
      params.page,
      params.pageSize,
      params.search,
      params.sortBy,
      params.sortDir,
      params.subsidiary,
      params.estatus,
      params.vendorId,
    ],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchEntityRows(token, entityKey, params);
    },
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}
