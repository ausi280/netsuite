import { useQuery } from '@tanstack/react-query';
import { fetchTareasVencidasByMonth } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';

export function useTareasVencidasByMonth(dateFrom: string, dateTo: string) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['tareas-vencidas-by-month', dateFrom, dateTo],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchTareasVencidasByMonth(token, dateFrom, dateTo);
    },
  });
}
