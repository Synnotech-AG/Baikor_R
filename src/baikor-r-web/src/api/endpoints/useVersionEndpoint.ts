import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'

interface VersionResponse {
  version: string
}

export function useVersionEndpoint() {
  return useEndpoint(async () => (await httpClient.get<VersionResponse>('/api/version')).data)
}
