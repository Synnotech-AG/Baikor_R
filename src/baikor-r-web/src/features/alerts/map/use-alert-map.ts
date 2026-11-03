import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type Map from 'ol/Map.js'
import { mapTheme } from '../../../theme'
import type { createDeferredMapFit } from '../../construction-sites/map/deferred-map-fit'
import type { MapLayerId, MapLayerVisibility } from '../../construction-sites/map/map-layer-model'
import type { AlertDetails, AlertSelectionOrigin, AlertSummary } from '../types'
import { createAlertMapLayers } from './alert-map-layer'
import { alertFocusExtent } from './alert-map-model'

interface UseAlertMapOptions {
  mapRef: RefObject<Map | null>
  mapFit: ReturnType<typeof createDeferredMapFit>
  layerVisibility: MapLayerVisibility
  revealLayer: (id: MapLayerId) => void
  clearRouteFocus: () => void
  onSelectionChange: (selected: boolean) => void
}

/** Alert evidence is independent from route selection and background map data. */
export function useAlertMap({
  mapRef,
  mapFit,
  layerVisibility,
  revealLayer,
  clearRouteFocus,
  onSelectionChange,
}: UseAlertMapOptions) {
  const [layers] = useState(() =>
    createAlertMapLayers({
      ...mapTheme.alert,
      siteFill: mapTheme.selected.fill,
      siteStroke: mapTheme.selected.stroke,
    }),
  )
  const visibilityRef = useRef(layerVisibility)
  visibilityRef.current = layerVisibility
  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }
    layers.setVisibility(visibilityRef.current)
    for (const layer of layers.layers) {
      map.addLayer(layer)
    }
    return () => {
      for (const layer of layers.layers) {
        map.removeLayer(layer)
      }
    }
  }, [layers, mapRef])
  useEffect(() => layers.setVisibility(layerVisibility), [layers, layerVisibility])

  const clearAlertFocus = useCallback(() => {
    layers.clearSelection()
    mapFit.cancel()
    onSelectionChange(false)
  }, [layers, mapFit, onSelectionChange])
  const focusAlert = useCallback(
    (alert: AlertDetails, focusGeometry = true, origin: AlertSelectionOrigin = 'current') => {
      clearRouteFocus()
      layers.selectAlert(alert, origin)
      onSelectionChange(true)
      revealLayer('alerts')
      if (alert.details?.siteGeometries?.length) {
        revealLayer('constructionSites')
      }
      if (!focusGeometry) {
        mapFit.cancel()
        return
      }
      const extent = alertFocusExtent(alert)
      if (extent) {
        mapFit.request(extent, {
          maxZoom: 18,
          padding: [80, 80, 80, 80],
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
        })
      }
    },
    [clearRouteFocus, layers, mapFit, onSelectionChange, revealLayer],
  )

  const setAlerts = useCallback(
    (alerts: readonly AlertSummary[]) => {
      if (layers.setAlerts(alerts)) {
        mapFit.cancel()
        onSelectionChange(false)
      }
    },
    [layers, mapFit, onSelectionChange],
  )
  return { focusAlert, clearAlertFocus, setAlerts, pickAlert: layers.pickAlert }
}
