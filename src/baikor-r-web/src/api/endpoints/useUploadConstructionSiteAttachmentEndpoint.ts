import type { ConstructionSiteAttachment } from '../../features/construction-sites/types'
import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'

export function useUploadConstructionSiteAttachmentEndpoint() {
  return useEndpoint(async (constructionSiteId: string, file: File) => {
    const data = new FormData()
    data.append('file', file)
    return (await httpClient.post<ConstructionSiteAttachment>(
      `/api/construction-sites/${constructionSiteId}/attachments`,
      data,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )).data
  })
}
