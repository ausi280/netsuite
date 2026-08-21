import { useQuery } from '@tanstack/react-query';
import { fetchEntityRecord } from '../api/reportsApi';
import type { ReportEntityKey } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

interface UseEntityRecordOptions {
  enabled?: boolean;
}

export function useEntityRecord(entityKey: ReportEntityKey, id: string, options: UseEntityRecordOptions = {}) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['reportRecord', entityKey, id],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchEntityRecord(token, entityKey, id);
    },
    enabled: Boolean(entityKey && id) && (options.enabled ?? true),
  });
}
