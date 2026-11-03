import type { ConstructionSiteSummary } from './types'

export async function refreshSelectedSite(
  sites: ConstructionSiteSummary[],
  selectedId: () => string | null,
  getSite: (id: string) => Promise<ConstructionSiteSummary | null>,
  isCurrent: () => boolean,
) {
  const result = [...sites]
  const checked = new Set<string>()
  while (isCurrent()) {
    const id = selectedId()
    if (!id || checked.has(id) || result.some((site) => site.id === id)) {
      break
    }
    checked.add(id)
    const site = await getSite(id)
    if (site) {
      result.push(site)
    }
  }
  return result
}
