import type {
  AlertDetails,
  AlertEvidence,
  AlertFilters,
  AlertHandling,
  AlertHandlingRequest,
  AlertSummary,
  DetectionStatus,
} from './types'
import { alertFocusExtent } from './map/alert-map-model.ts'

export const defaultAlertFilters: AlertFilters = {
  search: '',
  type: 'all',
  condition: 'present',
  handling: 'open',
  period: 'all',
  from: null,
  to: null,
}

export function toHistoricalAlert(current: AlertDetails, evidence: AlertEvidence): AlertDetails {
  return {
    ...current,
    type: evidence.type,
    evidenceRevision: evidence.evidenceRevision,
    createdAt: evidence.createdAt,
    location: evidence.location
      ? { ...evidence.location, coordinates: [...evidence.location.coordinates] }
      : null,
    focusEnvelope: evidence.focusEnvelope ? [...evidence.focusEnvelope] : null,
    details: evidence.details,
    events: [],
  }
}

export function buildAlertQuery(filters: AlertFilters, page: number, pageSize = 25) {
  return {
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.type !== 'all' ? { type: filters.type } : {}),
    ...(filters.condition !== 'all' ? { condition: filters.condition } : {}),
    ...(filters.handling !== 'all' ? { handling: filters.handling } : {}),
    ...(filters.period && filters.period !== 'all' ? { period: filters.period } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    page,
    pageSize,
  }
}

export function toHandlingRequest(
  alert: Pick<AlertSummary, 'evidenceRevision' | 'version'>,
  handling: AlertHandling,
  note: string,
): AlertHandlingRequest {
  return {
    handling,
    note: note.trim() || null,
    evidenceRevision: alert.evidenceRevision,
    version: alert.version,
  }
}

export function alertPaneMode(width: number, hasSelection: boolean) {
  return width >= 680 ? 'split' : hasSelection ? 'details' : 'list'
}

export function clampAlertDivider(value: number) {
  return Number.isFinite(value) ? Math.min(70, Math.max(28, value)) : 46
}

export function alertHasMapTarget(
  alert: Pick<AlertDetails, 'location' | 'details' | 'focusEnvelope'>,
) {
  return alertFocusExtent(alert) !== null
}

export function toPathFocusAlert(alert: AlertDetails, pathIndex: number): AlertDetails | null {
  const path = alert.details?.paths?.[pathIndex]
  if (!alert.details || !path?.geometry?.coordinates.length) {
    return null
  }
  const points = path.geometry.coordinates
    .flat()
    .filter((point) => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))
  if (!points.length) {
    return null
  }
  const focusEnvelope = points.reduce(
    (extent, point) => [
      Math.min(extent[0], point[0]),
      Math.min(extent[1], point[1]),
      Math.max(extent[2], point[0]),
      Math.max(extent[3], point[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
  return {
    ...alert,
    location: alert.location
      ? { ...alert.location, coordinates: [...alert.location.coordinates] }
      : null,
    focusEnvelope,
    details: {
      ...alert.details,
      routeGeometry: path.geometry,
      paths: [path],
    },
  }
}

export function detectionHealth(status: DetectionStatus | null) {
  if (status?.failedCount) {
    return 'failed'
  }
  if (status?.pausedTypes?.length) {
    return 'paused'
  }
  if (status?.pendingCount) {
    return 'pending'
  }
  return status?.lastEvaluatedAt ? 'current' : 'unknown'
}

export function toAreaFocusAlert(alert: AlertDetails, areaId: string): AlertDetails | null {
  const area = alert.details?.areas.find((candidate) => candidate.id === areaId)
  if (
    !area ||
    !alertHasMapTarget({
      location: area.location ?? null,
      focusEnvelope: area.focusEnvelope,
      details: null,
    })
  ) {
    return null
  }
  return {
    ...alert,
    location: area.location
      ? { ...area.location, coordinates: [...area.location.coordinates] }
      : null,
    focusEnvelope: area.focusEnvelope ? [...area.focusEnvelope] : null,
  }
}

export function hasIncompleteDetectionCoverage(status: DetectionStatus | null) {
  return (status?.unassessableSiteCount ?? 0) > 0
}
