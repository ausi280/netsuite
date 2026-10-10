import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCommissions } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useCommissions(month: number, year: number, subsidiary: string[] = [], currency: string = '', vendedor: string = '') {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['commissions', month, year, subsidiary, currency, vendedor],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchCommissions(token, month, year, subsidiary.length > 0 ? subsidiary : undefined, currency || undefined, vendedor || undefined);
    },
    placeholderData: keepPreviousData,
  });
}
