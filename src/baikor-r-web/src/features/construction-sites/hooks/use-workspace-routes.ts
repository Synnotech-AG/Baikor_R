import { useCallback, useEffect, useState } from 'react'
import { getRoutes } from '../../routes/api'
import type { RoutePathResponse } from '../../routes/types'

/** The map reads every API page; the route widget keeps its own independent filters. */
export function useWorkspaceRoutes(active: boolean, revision: number) {
  const [routes, setRoutes] = useState<RoutePathResponse[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!active) {
      return
    }
    const controller = new AbortController()
    const load = async () => {
      const loaded: RoutePathResponse[] = []
      for (let page = 1; ; page += 1) {
        const response = await getRoutes({ page, pageSize: 100 }, controller.signal)
        loaded.push(...response.items)
        if (loaded.length >= response.totalCount) {
          break
        }
        if (response.items.length === 0) {
          throw new Error('The route list changed while loading. Retry the request.')
        }
      }
      if (!controller.signal.aborted) {
        setRoutes(loaded)
        setLoadFailed(false)
      }
    }
    void load().catch(() => {
      if (!controller.signal.aborted) {
        setLoadFailed(true)
      }
    })
    return () => controller.abort()
  }, [active, revision, retry])
  return { routes, loadFailed, reload: useCallback(() => setRetry((value) => value + 1), []) }
}
