import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'

export interface ImportTrenchesResponse {
  batchId: string
  sourceProjectId: string
  featureCount: number
  skippedCount: number
  createdCount: number
  createdBySourceStatus: Record<string, number>
  warnings: string[]
}

export function useImportTrenchesEndpoint() {
  return useEndpoint(async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('bufferMetres', '1')
    const response = await httpClient.post<ImportTrenchesResponse>(
      '/api/construction-sites/imports/trenches',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return response.data
  })
}
