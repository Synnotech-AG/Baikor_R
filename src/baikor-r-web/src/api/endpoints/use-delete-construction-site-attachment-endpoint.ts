import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'

export function useDeleteConstructionSiteAttachmentEndpoint() {
  return useEndpoint(async (constructionSiteId: string, attachmentId: string) => {
    await httpClient.delete(
      `/api/construction-sites/${constructionSiteId}/attachments/${attachmentId}`,
    )
  })
}
