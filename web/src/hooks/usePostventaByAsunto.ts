import { useQuery } from '@tanstack/react-query';
import { fetchPostventaByAsunto } from '../api/reportsApi';
import type { PostventaFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePostventaByAsunto(params: PostventaFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['postventa-by-asunto', params.dateFrom, params.dateTo, params.ownerId],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPostventaByAsunto(token, params);
    },
  });
}
