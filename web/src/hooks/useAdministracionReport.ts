import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAdministracionReport } from '../api/reportsApi';
import type { AdministracionReportParams } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useAdministracionReport(params: AdministracionReportParams) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['administracion-report', params.month, params.year, params.churnFrom, params.churnTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchAdministracionReport(token, params);
    },
    placeholderData: keepPreviousData,
    // The churn part scans every servicio (~10s) - month-level data, no need to refetch often.
    staleTime: 10 * 60 * 1000,
  });
}
