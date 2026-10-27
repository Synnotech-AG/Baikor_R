import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'

export function useDeleteConstructionSiteEndpoint() {
  return useEndpoint(async (id: string) => {
    await httpClient.delete(`/api/construction-sites/${id}`)
  })
}
