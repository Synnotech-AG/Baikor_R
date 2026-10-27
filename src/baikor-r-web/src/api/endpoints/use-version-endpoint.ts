import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'

interface VersionResponse {
  version: string
}

export function useVersionEndpoint() {
  return useEndpoint(async () => (await httpClient.get<VersionResponse>('/api/version')).data)
}
