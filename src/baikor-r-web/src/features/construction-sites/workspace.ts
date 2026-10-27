import type { ConstructionSiteAreaRequest, ConstructionSiteFormValues, ConstructionSiteStatus, ConstructionSiteSummary, ConstructionSiteWriteRequest } from './types'

export type NavigationGuard = (proceed: () => void) => void
export interface WorkspaceFilters {
  search: string
  status: ConstructionSiteStatus | 'all'
  periodStart: string | null
  periodEnd: string | null
  includeUndated: boolean
}

export function filterConstructionSites(items: ConstructionSiteSummary[], filters: WorkspaceFilters, locale: string) {
  const search = filters.search.trim().toLocaleLowerCase(locale)
  return items.filter((item) => {
    const text = [item.title, ...Object.entries(item.metadata ?? {}).flat()].join(' ').toLocaleLowerCase(locale)
    if (search && !text.includes(search)) return false
    if (filters.status !== 'all' && item.status !== filters.status) return false
    const hasPeriod = filters.periodStart || filters.periodEnd
    if (hasPeriod && (!item.plannedStart || !item.plannedEnd) && !filters.includeUndated) return false
    if (filters.periodStart && item.plannedEnd && item.plannedEnd < filters.periodStart) return false
    if (filters.periodEnd && item.plannedStart && item.plannedStart > filters.periodEnd) return false
    return true
  })
}

export function toWriteRequest(values: ConstructionSiteFormValues, areas: ConstructionSiteAreaRequest[]): ConstructionSiteWriteRequest {
  return {
    title: values.title.trim(), status: values.status,
    plannedStart: values.plannedStart || null, plannedEnd: values.plannedEnd || null,
    diversion: values.diversion.trim() || null, areas,
    contacts: values.contacts.map((contact) => ({
      ...contact, firstName: contact.firstName.trim(), lastName: contact.lastName.trim(), role: contact.role.trim(),
      email: contact.email.trim() || null, phone1: contact.phone1.trim() || null, phone2: contact.phone2.trim() || null,
    })),
    communications: values.communications.map((item) => ({ ...item, type: item.type.trim(), note: item.note.trim() || null })),
    metadata: Object.fromEntries(values.metadata.map(({ key, value }) => [key.trim(), value.trim()])),
  }
}
