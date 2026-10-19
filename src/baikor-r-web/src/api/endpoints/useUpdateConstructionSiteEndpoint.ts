import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'
import type { ConstructionSiteSummary, UpdateConstructionSiteRequest } from '../../features/construction-sites/types'

export function useUpdateConstructionSiteEndpoint() {
  return useEndpoint(async (id: string, request: UpdateConstructionSiteRequest) =>
    (await httpClient.put<ConstructionSiteSummary>(`/api/construction-sites/${id}`, request)).data)
}
