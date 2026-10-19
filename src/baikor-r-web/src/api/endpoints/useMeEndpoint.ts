import { httpClient } from '../httpClient'
import { useEndpoint } from '../useEndpoint'
import type { UserSession } from '../../features/construction-sites/types'

export function useMeEndpoint() {
  return useEndpoint(async () => (await httpClient.get<UserSession>('/api/me')).data)
}
