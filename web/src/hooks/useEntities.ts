import { useQuery } from '@tanstack/react-query';
import { fetchEntities } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useEntities() {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['entities'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchEntities(token);
    },
  });
}
