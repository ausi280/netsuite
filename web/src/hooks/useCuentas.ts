import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCuentas } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useCuentas(page: number, pageSize: number, search: string, subsidiary: string[]) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['cuentas', page, pageSize, search, subsidiary],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchCuentas(token, { page, pageSize, search, subsidiary });
    },
    placeholderData: keepPreviousData,
  });
}
