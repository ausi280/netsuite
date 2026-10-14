import { useQuery } from '@tanstack/react-query';
import { fetchPostventaByOwner } from '../api/reportsApi';
import type { PostventaFiltersParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePostventaByOwner(params: PostventaFiltersParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['postventa-by-owner', params.dateFrom, params.dateTo, params.ownerId, params.empresaId],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPostventaByOwner(token, params);
    },
  });
}
