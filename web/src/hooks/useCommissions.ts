import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCommissions } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useCommissions(month: number, year: number, subsidiary: string = '', currency: string = '') {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['commissions', month, year, subsidiary, currency],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchCommissions(token, month, year, subsidiary || undefined, currency || undefined);
    },
    placeholderData: keepPreviousData,
  });
}
