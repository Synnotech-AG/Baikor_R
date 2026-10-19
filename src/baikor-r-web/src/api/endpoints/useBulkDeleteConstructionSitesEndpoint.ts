import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'

interface BulkDeleteConstructionSitesResponse {
  deletedCount: number
}

export function useBulkDeleteConstructionSitesEndpoint() {
  return useEndpoint(async (ids: string[]) => {
    const response = await httpClient.post<BulkDeleteConstructionSitesResponse>(
      '/api/construction-sites/bulk-delete',
      { ids },
    )
    return response.data
  })
}
