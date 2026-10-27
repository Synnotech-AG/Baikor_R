import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'
import type {
  ConstructionSiteSummary,
  UpdateConstructionSiteRequest,
} from '../../features/construction-sites/types'

export function useUpdateConstructionSiteEndpoint() {
  return useEndpoint(
    async (id: string, request: UpdateConstructionSiteRequest) =>
      (await httpClient.put<ConstructionSiteSummary>(`/api/construction-sites/${id}`, request))
        .data,
  )
}
