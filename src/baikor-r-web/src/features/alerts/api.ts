import { httpClient } from '../../api/http-client'
import { useEndpoint } from '../../api/use-endpoint'
import { buildAlertQuery } from './alert-model'
import type {
  AlertDetails,
  AlertEvidence,
  AlertFilters,
  AlertHandlingRequest,
  AlertScan,
  DetectionStatus,
  PagedAlerts,
  RouteConflictRule,
} from './types'

export async function getAlerts(
  filters: AlertFilters,
  page: number,
  signal?: AbortSignal,
  pageSize = 25,
) {
  return (
    await httpClient.get<PagedAlerts>('/api/alerts', {
      params: buildAlertQuery(filters, page, pageSize),
      signal,
    })
  ).data
}
export async function getAlert(id: string, signal?: AbortSignal) {
  return (await httpClient.get<AlertDetails>(`/api/alerts/${encodeURIComponent(id)}`, { signal }))
    .data
}
export async function getAlertEvidence(id: string, revision: number, signal?: AbortSignal) {
  return (
    await httpClient.get<AlertEvidence>(
      `/api/alerts/${encodeURIComponent(id)}/evidence/${revision}`,
      { signal },
    )
  ).data
}
export async function getDetectionStatus(signal?: AbortSignal) {
  return (await httpClient.get<DetectionStatus>('/api/alerts/detection-status', { signal })).data
}
export async function getRouteConflictRule(signal?: AbortSignal) {
  return (await httpClient.get<RouteConflictRule>('/api/alerts/rules/route-conflict', { signal }))
    .data
}
export function useReviewAlertEndpoint() {
  return useEndpoint(async (id: string, request: AlertHandlingRequest) => {
    await httpClient.post(`/api/alerts/${encodeURIComponent(id)}/handling`, request)
  })
}
export function useSaveAlertRuleEndpoint() {
  return useEndpoint(
    async (request: RouteConflictRule) =>
      (await httpClient.put<RouteConflictRule>('/api/alerts/rules/route-conflict', request)).data,
  )
}
export function useStartAlertScanEndpoint() {
  return useEndpoint(async () => (await httpClient.post<AlertScan>('/api/alerts/scans')).data)
}
