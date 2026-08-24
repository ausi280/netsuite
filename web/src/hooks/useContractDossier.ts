import { useQuery } from '@tanstack/react-query';
import { fetchContractDossier } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useContractDossier(id: string, options: { enabled?: boolean } = {}) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['contractDossier', id],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchContractDossier(token, id);
    },
    enabled: options.enabled ?? true,
  });
}
