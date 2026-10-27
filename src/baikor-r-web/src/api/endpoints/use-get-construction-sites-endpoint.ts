import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'
import type { ConstructionSiteSummary } from '../../features/construction-sites/types'

export function useGetConstructionSitesEndpoint() {
  return useEndpoint(
    async () => (await httpClient.get<ConstructionSiteSummary[]>('/api/construction-sites')).data,
  )
}
