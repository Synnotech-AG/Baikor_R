export interface MultiLineStringDto {
  type: 'MultiLineString'
  coordinates: number[][][]
}

export interface RouteOperatingPeriod {
  from: string
  to: string
}

export interface RoutePathVersionResponse {
  id: string
  geometry: MultiLineStringDto
  validFrom: string | null
  validTo: string | null
  sourceCoverageStart: string | null
  sourceCoverageEnd: string | null
  hasOperatingCalendar: boolean
  periods: RouteOperatingPeriod[]
}

export interface RoutePathItemResponse {
  id: string
  title: string
  externalShapeId: string | null
  isSuppressed: boolean
  versions: RoutePathVersionResponse[]
}

export interface RoutePathResponse {
  id: string
  title: string
  description: string | null
  sourceId: string | null
  externalRouteId: string | null
  isSuppressed: boolean
  createdAt: string
  updatedAt: string
  version: number
  paths: RoutePathItemResponse[]
}

export interface RoutePathItemWriteRequest {
  id?: string
  title: string
  validFrom: string | null
  validTo: string | null
  geometry: MultiLineStringDto
}

export interface RoutePathWriteRequest {
  title: string
  description: string | null
  paths: RoutePathItemWriteRequest[]
  version?: number
}

export interface RoutePathFormValues {
  key: string
  id?: string
  title: string
  validFrom: string
  validTo: string
  geometry: MultiLineStringDto | null
}

export interface RouteFormValues {
  title: string
  description: string
  paths: RoutePathFormValues[]
}

export interface PagedRoutes {
  items: RoutePathResponse[]
  totalCount: number
  page: number
  pageSize: number
}

export interface RouteImportResult {
  sourceId: string
  createdCount: number
  updatedCount: number
  unchangedCount: number
  suppressedCount: number
  createdPathCount: number
  updatedPathCount: number
  unchangedPathCount: number
  suppressedPathCount: number
  pathCount: number
  routeCount: number
  tripCount: number
  shapeCount: number
  coverageStart: string | null
  coverageEnd: string | null
  warnings: string[]
}
