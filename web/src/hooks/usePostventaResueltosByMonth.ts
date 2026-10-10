import { useQuery } from '@tanstack/react-query';
import { fetchPostventaResueltosByMonth } from '../api/reportsApi';
import type { PostventaFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePostventaResueltosByMonth(params: PostventaFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['postventa-resueltos-by-month', params.dateFrom, params.dateTo, params.ownerId],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPostventaResueltosByMonth(token, params);
    },
  });
}
