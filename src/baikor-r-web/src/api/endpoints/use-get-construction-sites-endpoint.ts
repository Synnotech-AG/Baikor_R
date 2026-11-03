import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'
import type {
  ConstructionSiteArchive,
  ConstructionSiteSummary,
} from '../../features/construction-sites/types'

export function useGetConstructionSitesEndpoint() {
  return useEndpoint(
    async (archive: ConstructionSiteArchive = 'active') =>
      (
        await httpClient.get<ConstructionSiteSummary[]>('/api/construction-sites', {
          params: { archive },
        })
      ).data,
  )
}
