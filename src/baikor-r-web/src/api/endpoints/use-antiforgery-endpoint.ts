import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'
import type { AntiforgeryToken } from '../../features/construction-sites/types'

export function useAntiforgeryEndpoint() {
  return useEndpoint(async () => (await httpClient.get<AntiforgeryToken>('/api/antiforgery')).data)
}
