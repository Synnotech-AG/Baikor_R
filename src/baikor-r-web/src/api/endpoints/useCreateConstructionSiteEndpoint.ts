import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'
import type { ConstructionSiteSummary, ConstructionSiteWriteRequest } from '../../features/construction-sites/types'

export function useCreateConstructionSiteEndpoint() {
  return useEndpoint(async (request: ConstructionSiteWriteRequest) =>
    (await httpClient.post<ConstructionSiteSummary>('/api/construction-sites', request)).data)
}
