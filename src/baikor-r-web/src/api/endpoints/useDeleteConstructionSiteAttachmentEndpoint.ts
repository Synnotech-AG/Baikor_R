import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'

export function useDeleteConstructionSiteAttachmentEndpoint() {
  return useEndpoint(async (constructionSiteId: string, attachmentId: string) => {
    await httpClient.delete(`/api/construction-sites/${constructionSiteId}/attachments/${attachmentId}`)
  })
}
