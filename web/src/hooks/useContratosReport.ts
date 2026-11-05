import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchContratosReport } from '../api/reportsApi';
import type { ContratosReportParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useContratosReport(params: ContratosReportParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['contratos-report', params],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchContratosReport(token, params);
    },
    placeholderData: keepPreviousData,
  });
}
