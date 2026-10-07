import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCobranzaCommissions } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useCobranzaCommissions(month: number, year: number, subsidiary: string[] = []) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['cobranza-commissions', month, year, subsidiary],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchCobranzaCommissions(token, month, year, subsidiary.length > 0 ? subsidiary : undefined);
    },
    placeholderData: keepPreviousData,
  });
}
