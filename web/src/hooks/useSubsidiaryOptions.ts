import { useQuery } from '@tanstack/react-query';
import { fetchSubsidiaryOptions } from '../api/reportsApi';
import type { ReportEntityKey } from '../api/types';
import { useApiToken } from '../auth/useApiToken';

interface UseSubsidiaryOptionsOptions {
  enabled?: boolean;
}

/** Distinct subsidiary ids for one entity's filter dropdown. Returns an empty list for entities with no subsidiary column synced. */
export function useSubsidiaryOptions(entityKey: ReportEntityKey, options: UseSubsidiaryOptionsOptions = {}) {
  const { getAccessToken } = useApiToken();

  return useQuery({
    queryKey: ['subsidiaryOptions', entityKey],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchSubsidiaryOptions(token, entityKey);
    },
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}
