import { useQuery } from '@tanstack/react-query';
import { fetchPostventaOwners } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function usePostventaOwners() {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['postventa-owners'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchPostventaOwners(token);
    },
    staleTime: 5 * 60 * 1000,
  });
}
