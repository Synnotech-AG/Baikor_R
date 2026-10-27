import { httpClient } from '../http-client'
import { useEndpoint } from '../use-endpoint'
import type { UserSession } from '../../features/construction-sites/types'

export function useMeEndpoint() {
  return useEndpoint(async () => (await httpClient.get<UserSession>('/api/me')).data)
}
