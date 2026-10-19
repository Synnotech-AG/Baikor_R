export type ConstructionSiteStatus = 'draft' | 'planned' | 'approved' | 'active'

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface ConstructionSiteAreaSummary {
  id: string
  name: string
  areaSquareMetres: number
  geometry: PolygonGeometry
}

export interface ConstructionSiteSummary {
  id: string
  title: string
  status: ConstructionSiteStatus
  plannedStart: string | null
  plannedEnd: string | null
  areaSquareMetres: number
  areas: ConstructionSiteAreaSummary[]
  diversion: string | null
  contacts: ConstructionSiteContact[]
  communications: ConstructionSiteCommunication[]
  metadata: Record<string, string>
  updatedAt: string
  version: number
}

export interface ConstructionSiteContact {
  id: string
  firstName: string
  lastName: string
  role: string
  email: string | null
  phone1: string | null
  phone2: string | null
}

export interface ConstructionSiteContactFormValues {
  id: string | null
  firstName: string
  lastName: string
  role: string
  email: string
  phone1: string
  phone2: string
}

export interface ConstructionSiteCommunication {
  id: string
  type: string
  note: string | null
}

export interface ConstructionSiteCommunicationFormValues {
  id: string | null
  type: string
  note: string
}

export interface ConstructionSiteMetadataEntryFormValues {
  key: string
  value: string
}

export interface ConstructionSiteAttachment {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
}

export interface ConstructionSiteAreaRequest {
  id: string | null
  name: string
  geometry: PolygonGeometry
}

export interface ConstructionSiteFormValues {
  title: string
  status: ConstructionSiteStatus
  plannedStart: string
  plannedEnd: string
  diversion: string
  contacts: ConstructionSiteContactFormValues[]
  communications: ConstructionSiteCommunicationFormValues[]
  metadata: ConstructionSiteMetadataEntryFormValues[]
}

export interface ConstructionSiteWriteRequest {
  title: string
  status: ConstructionSiteStatus
  plannedStart: string | null
  plannedEnd: string | null
  diversion: string | null
  contacts: Array<Omit<ConstructionSiteContactFormValues, 'email' | 'phone1' | 'phone2'> & {
    email: string | null
    phone1: string | null
    phone2: string | null
  }>
  communications: Array<Omit<ConstructionSiteCommunicationFormValues, 'note'> & { note: string | null }>
  metadata: Record<string, string>
  areas: ConstructionSiteAreaRequest[]
}

export interface UpdateConstructionSiteRequest extends ConstructionSiteWriteRequest {
  version: number
}

export interface EditorArea {
  key: string
  id: string | null
  name: string
  areaSquareMetres: number
}

export interface UserSession {
  name: string
  roles: string[]
}

export interface AntiforgeryToken {
  token: string
}
