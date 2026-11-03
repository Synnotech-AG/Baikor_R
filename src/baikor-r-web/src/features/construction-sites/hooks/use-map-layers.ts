import { useCallback, useEffect, useState } from 'react'
import {
  readMapLayerVisibility,
  writeMapLayerVisibility,
  type MapLayerId,
} from '../map/map-layer-model'

export function useMapLayers() {
  const [visibility, setVisibility] = useState(() => readMapLayerVisibility())

  useEffect(() => {
    writeMapLayerVisibility(undefined, visibility)
  }, [visibility])

  const setLayerVisible = useCallback((id: MapLayerId, visible: boolean) => {
    setVisibility((current) => (current[id] === visible ? current : { ...current, [id]: visible }))
  }, [])

  const revealLayer = useCallback((id: MapLayerId) => setLayerVisible(id, true), [setLayerVisible])

  return { visibility, setLayerVisible, revealLayer }
}
