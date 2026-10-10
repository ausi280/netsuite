import { useQuery } from '@tanstack/react-query';
import { fetchPostventaByMonth } from '../api/reportsApi';
import type { PostventaFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePostventaByMonth(params: PostventaFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['postventa-by-month', params.dateFrom, params.dateTo, params.ownerId],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPostventaByMonth(token, params);
    },
  });
}
