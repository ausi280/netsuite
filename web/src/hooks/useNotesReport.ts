import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchNotesReport } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useNotesReport(dateFrom: string, dateTo: string) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['notas-report', dateFrom, dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchNotesReport(token, dateFrom, dateTo);
    },
    placeholderData: keepPreviousData,
  });
}
