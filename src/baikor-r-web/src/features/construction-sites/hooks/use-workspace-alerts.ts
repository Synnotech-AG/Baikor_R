import { useCallback, useEffect, useRef, useState } from 'react'
import { loadWorkspaceAlerts, shouldReloadWorkspaceAlerts } from '../../alerts/alert-map-data'
import { getAlerts } from '../../alerts/api'
import { buildAlertQuery, defaultAlertFilters } from '../../alerts/alert-model'
import type { AlertFilters, AlertSummary, DetectionStatus } from '../../alerts/types'

const noAlerts: AlertSummary[] = []

/** Map summaries use the shared filters and read every page independently of the widget's lifetime. */
export function useWorkspaceAlerts(
  active: boolean,
  revision: number,
  enabled = true,
  filters: AlertFilters = defaultAlertFilters,
  status: DetectionStatus | null = null,
) {
  const queryKey = JSON.stringify(buildAlertQuery(filters, 1, 100))
  const [loaded, setLoaded] = useState<{ queryKey: string; alerts: AlertSummary[] }>({
    queryKey,
    alerts: noAlerts,
  })
  const [loadFailed, setLoadFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const reload = useCallback(() => setRetry((value) => value + 1), [])
  const previousStatusRef = useRef<DetectionStatus | null>(null)

  useEffect(() => {
    if (!active || !enabled) {
      return
    }
    const controller = new AbortController()
    setLoadFailed(false)
    void loadWorkspaceAlerts(
      (page, signal) => getAlerts(filters, page, signal, 100),
      controller.signal,
    )
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setLoaded({ queryKey, alerts: loaded })
          setLoadFailed(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadFailed(true)
        }
      })
    return () => controller.abort()
  }, [active, enabled, revision, retry, filters, queryKey])

  useEffect(() => {
    if (!active || !enabled) {
      previousStatusRef.current = null
      return
    }
    if (!status) {
      return
    }
    if (shouldReloadWorkspaceAlerts(previousStatusRef.current, status)) {
      reload()
    }
    previousStatusRef.current = status
  }, [active, enabled, status, reload])

  return { alerts: loaded.queryKey === queryKey ? loaded.alerts : noAlerts, loadFailed, reload }
}
