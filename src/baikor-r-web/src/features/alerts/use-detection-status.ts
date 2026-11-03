import { useCallback, useEffect, useState } from 'react'
import { getDetectionStatus } from './api'
import type { AlertScan, DetectionStatus } from './types'

export function useDetectionStatus(active: boolean, revision: number) {
  const [status, setStatus] = useState<DetectionStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [retry, setRetry] = useState(0)
  const reload = useCallback(() => setRetry((value) => value + 1), [])

  useEffect(() => {
    if (!active) {
      return
    }
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      let delay = 20000
      try {
        const next = await getDetectionStatus(controller.signal)
        if (!controller.signal.aborted) {
          setStatus(next)
          setUnavailable(false)
          delay = next.pendingCount > 0 ? 3000 : 20000
        }
      } catch {
        if (!controller.signal.aborted) {
          setUnavailable(true)
        }
      } finally {
        if (!controller.signal.aborted) {
          timeout = setTimeout(() => {
            void poll()
          }, delay)
        }
      }
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [active, revision, retry])

  const scanStarted = useCallback(
    (scan: AlertScan) => {
      setStatus((current) => ({
        pendingCount: Math.max(1, current?.pendingCount ?? 0),
        failedCount: current?.failedCount ?? 0,
        lastEvaluatedAt: current?.lastEvaluatedAt ?? null,
        latestScan: scan,
        unassessableSiteCount: current?.unassessableSiteCount,
        pausedTypes: current?.pausedTypes,
      }))
      reload()
    },
    [reload],
  )

  return { status, unavailable, reload, scanStarted }
}
