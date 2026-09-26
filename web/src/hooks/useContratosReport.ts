import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchContratosReport } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useContratosReport(page: number, pageSize: number, search: string, subsidiary: string[]) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['contratos-report', page, pageSize, search, subsidiary],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchContratosReport(token, { page, pageSize, search, subsidiary });
    },
    placeholderData: keepPreviousData,
  });
}
