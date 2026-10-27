import type Map from 'ol/Map.js'
import type { Extent } from 'ol/extent.js'
import type { FitOptions } from 'ol/View.js'

type MapFitTarget = Pick<Map, 'updateSize' | 'getSize' | 'getView'>

export function createDeferredMapFit(getMap: () => MapFitTarget | null) {
  let pending: { extent: Extent; options: FitOptions } | null = null
  let context: string | null = null

  const flush = () => {
    const map = getMap()
    if (!map) return
    // The previous map size can be stale while a docked panel is hidden.
    map.updateSize()
    const size = map.getSize()
    if (!pending || !size || !size.every((dimension) => Number.isFinite(dimension) && dimension > 0)) return
    const request = pending
    pending = null
    const padding = request.options.padding?.map((value, index) =>
      Math.min(Number.isFinite(value) ? Math.max(0, value) : 0, size[index % 2 === 0 ? 1 : 0] / 4))
    map.getView().fit(request.extent, { ...request.options, size, padding })
  }

  return {
    request(extent: Extent, options: FitOptions) {
      pending = { extent: [...extent], options }
      flush()
    },
    flush,
    setContext(next: string | null) {
      if (context !== next) pending = null
      context = next
    },
    cancel() { pending = null },
  }
}
