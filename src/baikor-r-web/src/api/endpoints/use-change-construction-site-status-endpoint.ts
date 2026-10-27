import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'
import type {
  ConstructionSiteStatus,
  ConstructionSiteSummary,
} from '../../features/construction-sites/types'

export function useChangeConstructionSiteStatusEndpoint() {
  return useEndpoint(
    async (id: string, status: ConstructionSiteStatus) =>
      (
        await httpClient.post<ConstructionSiteSummary>(`/api/construction-sites/${id}/status`, {
          status,
        })
      ).data,
  )
}
