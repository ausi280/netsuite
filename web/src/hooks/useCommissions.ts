import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCommissions } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useCommissions(month: number, year: number, subsidiary: string = '') {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['commissions', month, year, subsidiary],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchCommissions(token, month, year, subsidiary || undefined);
    },
    placeholderData: keepPreviousData,
  });
}
