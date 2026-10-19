import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'
import type { ConstructionSiteSummary } from '../../features/construction-sites/types'

export function useGetConstructionSitesEndpoint() {
  return useEndpoint(async () =>
    (await httpClient.get<ConstructionSiteSummary[]>('/api/construction-sites')).data)
}
