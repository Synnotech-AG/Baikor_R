import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'
import type { ConstructionSiteStatus, ConstructionSiteSummary } from '../../features/construction-sites/types'

export function useChangeConstructionSiteStatusEndpoint() {
  return useEndpoint(async (id: string, status: ConstructionSiteStatus) =>
    (await httpClient.post<ConstructionSiteSummary>(`/api/construction-sites/${id}/status`, { status })).data)
}
