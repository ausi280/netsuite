import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchPostventaTickets } from '../api/reportsApi';
import type { PostventaTicketsParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePostventaTickets(params: PostventaTicketsParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['postventa-tickets', params.dateFrom, params.dateTo, params.ownerId, params.page, params.pageSize],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPostventaTickets(token, params);
    },
    placeholderData: keepPreviousData,
  });
}
