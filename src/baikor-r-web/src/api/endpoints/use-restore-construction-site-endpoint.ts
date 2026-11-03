import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'
import type { ConstructionSiteSummary } from '../../features/construction-sites/types'

export function useRestoreConstructionSiteEndpoint() {
  return useEndpoint(
    async (id: string, version: number) =>
      (
        await httpClient.post<ConstructionSiteSummary>(
          `/api/construction-sites/${encodeURIComponent(id)}/restore`,
          { version },
        )
      ).data,
  )
}
