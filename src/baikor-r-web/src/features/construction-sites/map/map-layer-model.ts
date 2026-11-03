export const mapLayerDefinitions = [
  {
    id: 'constructionSites',
    translationKey: 'map.layers.constructionSites',
    kind: 'area',
    defaultVisible: true,
  },
  { id: 'routes', translationKey: 'map.layers.routes', kind: 'line', defaultVisible: true },
  { id: 'alerts', translationKey: 'map.layers.alerts', kind: 'warning', defaultVisible: false },
] as const

export type MapLayerId = (typeof mapLayerDefinitions)[number]['id']
export type MapLayerVisibility = Record<MapLayerId, boolean>

export const defaultMapLayerVisibility = Object.fromEntries(
  mapLayerDefinitions.map(({ id, defaultVisible }) => [id, defaultVisible]),
) as MapLayerVisibility

const storageKey = 'baikor-r.map-layers.v1'

export function readMapLayerVisibility(storage?: Pick<Storage, 'getItem'>): MapLayerVisibility {
  const visibility = { ...defaultMapLayerVisibility }
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(storageKey)
    const saved: unknown = raw ? JSON.parse(raw) : null
    if (
      !saved ||
      typeof saved !== 'object' ||
      !('version' in saved) ||
      saved.version !== 1 ||
      !('visibility' in saved) ||
      !saved.visibility ||
      typeof saved.visibility !== 'object'
    ) {
      return visibility
    }
    for (const { id } of mapLayerDefinitions) {
      const value = (saved.visibility as Record<string, unknown>)[id]
      if (typeof value === 'boolean') {
        visibility[id] = value
      }
    }
  } catch {
    // Blocked or corrupt storage must not prevent the map from opening.
  }
  return visibility
}

export function writeMapLayerVisibility(
  storage: Pick<Storage, 'setItem'> | undefined,
  visibility: MapLayerVisibility,
): void {
  try {
    ;(storage ?? globalThis.localStorage)?.setItem(
      storageKey,
      JSON.stringify({ version: 1, visibility }),
    )
  } catch {
    // The current in-memory choices remain usable when storage is unavailable or full.
  }
}
