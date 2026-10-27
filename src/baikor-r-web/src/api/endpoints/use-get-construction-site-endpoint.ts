import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'
import type { ConstructionSiteSummary } from '../../features/construction-sites/types'

export function useGetConstructionSiteEndpoint() {
  return useEndpoint(
    async (id: string) =>
      (await httpClient.get<ConstructionSiteSummary>(`/api/construction-sites/${id}`)).data,
  )
}
