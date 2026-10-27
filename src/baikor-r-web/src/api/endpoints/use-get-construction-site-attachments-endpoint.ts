import type { ConstructionSiteAttachment } from '../../features/construction-sites/types'
import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'

export function useGetConstructionSiteAttachmentsEndpoint() {
  return useEndpoint(
    async (constructionSiteId: string) =>
      (
        await httpClient.get<ConstructionSiteAttachment[]>(
          `/api/construction-sites/${constructionSiteId}/attachments`,
        )
      ).data,
  )
}
