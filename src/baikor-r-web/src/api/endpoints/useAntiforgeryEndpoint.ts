import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'
import type { AntiforgeryToken } from '../../features/construction-sites/types'

export function useAntiforgeryEndpoint() {
  return useEndpoint(async () => (await httpClient.get<AntiforgeryToken>('/api/antiforgery')).data)
}
