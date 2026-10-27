import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'

export function useDownloadConstructionSiteAttachmentEndpoint() {
  return useEndpoint(
    async (constructionSiteId: string, attachmentId: string) =>
      (
        await httpClient.get<Blob>(
          `/api/construction-sites/${constructionSiteId}/attachments/${attachmentId}`,
          { responseType: 'blob' },
        )
      ).data,
  )
}
