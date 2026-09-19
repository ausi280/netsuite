import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchProspectos } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useProspectos(dateFrom: string, dateTo: string, page: number, pageSize: number) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['prospectos', dateFrom, dateTo, page, pageSize],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchProspectos(token, { dateFrom, dateTo, page, pageSize });
    },
    placeholderData: keepPreviousData,
  });
}
