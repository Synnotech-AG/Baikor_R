import type { ConstructionSiteStatus, PolygonGeometry } from '../construction-sites/types'
import type { MultiLineStringDto } from '../routes/types'

export type AlertCondition = 'present' | 'cleared'
export type AlertHandling = 'open' | 'acknowledged' | 'handled'
export type AlertSelectionOrigin = 'current' | 'historical'
export interface AlertSummary {
  id: string
  type: string
  summary: string
  description: string | null
  condition: AlertCondition
  handling: AlertHandling
  occurrence: number
  evidenceRevision: number
  location: { type: 'Point'; coordinates: number[] } | null
  createdAt: string
  updatedAt: string
  lastEvaluatedAt: string | null
  version: number
  periods?: Array<{ from: string | null; to: string | null }>
  supersededByAlertId?: string | null
}
export interface RouteConflictPathSnapshot {
  pathId?: string | null
  pathTitle?: string | null
  geometry: MultiLineStringDto | null
  validFrom: string | null
  validTo: string | null
  sourceCoverageStart?: string | null
  sourceCoverageEnd?: string | null
  hasOperatingCalendar: boolean
  periods: Array<{ from: string | null; to: string | null }>
}
export interface RouteConflictDetails {
  routeId: string
  routeTitle: string
  constructionSiteId: string
  constructionSiteTitle: string
  distanceMetres: number
  sensitivityMetres: number
  periods: Array<{ from: string | null; to: string | null }>
  areas: Array<{
    id: string
    name: string
    location?: AlertSummary['location']
    focusEnvelope?: number[] | null
    geometry?: PolygonGeometry
  }>
  routeGeometry: MultiLineStringDto | null
  siteGeometries: PolygonGeometry[]
  paths?: RouteConflictPathSnapshot[]
}
export interface AlertEvent {
  id: string
  kind: string
  explanation: string
  createdAt: string
  actor: string | null
  note: string | null
  evidenceRevision: number
  occurrence: number
  handling?: AlertHandling | null
}
export interface AlertDetails extends AlertSummary {
  evidenceRevisions?: number[]
  details: RouteConflictDetails | null
  events: AlertEvent[]
  focusEnvelope?: number[] | null
  reviewedEvidenceRevision?: number | null
  handlingActor?: string | null
  handlingNote?: string | null
  handledAt?: string | null
  relatedAlerts?: Array<{
    id: string
    summary: string
    handling: AlertHandling
    evidenceRevision: number
  }>
}
export interface AlertEvidence {
  alertId: string
  type: string
  evidenceRevision: number
  createdAt: string
  location: AlertSummary['location']
  focusEnvelope?: number[] | null
  details: RouteConflictDetails | null
}
export interface AlertFilters {
  search: string
  type: string
  condition: AlertCondition | 'all'
  handling: AlertHandling | 'all'
  period?: 'all' | 'current' | 'upcoming' | 'past'
  from?: string | null
  to?: string | null
}
export interface PagedAlerts {
  items: AlertSummary[]
  totalCount: number
  page: number
  pageSize: number
}
export interface AlertHandlingRequest {
  handling: AlertHandling
  note: string | null
  evidenceRevision: number
  version: number
}
export interface RouteConflictRule {
  id: string
  enabled: boolean
  sensitivityMetres: number
  eligibleStatuses: ConstructionSiteStatus[]
  version: number
}
export interface AlertScan {
  id: string
  state: string
  totalCount: number
  completedCount: number
  failedCount: number
}
export interface DetectionStatus {
  pendingCount: number
  failedCount: number
  lastEvaluatedAt: string | null
  latestScan?: AlertScan | null
  unassessableSiteCount?: number
  pausedTypes?: string[]
}
