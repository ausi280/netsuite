import { useQuery } from '@tanstack/react-query';
import { fetchReembolsoEmpresas } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useReembolsoEmpresas() {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['reembolso-empresas'],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchReembolsoEmpresas(token);
    },
  });
}
