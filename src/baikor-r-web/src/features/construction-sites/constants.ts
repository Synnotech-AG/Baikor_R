import type { ConstructionSiteStatus } from './types'

export const constructionSiteStatuses: ConstructionSiteStatus[] = [
  'draft',
  'planned',
  'approved',
  'active',
]

export const editorRoles = ['baikor_editor', 'baikor_approver', 'baikor_admin']

export const statusTranslationKey = (status: ConstructionSiteStatus) =>
  `constructionSites.status.${status}` as const
