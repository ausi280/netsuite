import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchPostventaSummary } from '../api/reportsApi';
import type { PostventaFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePostventaSummary(params: PostventaFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['postventa-summary', params.dateFrom, params.dateTo, params.ownerId],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPostventaSummary(token, params);
    },
    placeholderData: keepPreviousData,
  });
}
