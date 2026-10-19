import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'

export function useDeleteConstructionSiteEndpoint() {
  return useEndpoint(async (id: string) => {
    await httpClient.delete(`/api/construction-sites/${id}`)
  })
}
