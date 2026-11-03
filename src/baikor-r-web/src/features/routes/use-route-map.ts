import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import Feature from 'ol/Feature.js'
import type Map from 'ol/Map.js'
import LineString from 'ol/geom/LineString.js'
import MultiLineString from 'ol/geom/MultiLineString.js'
import Draw from 'ol/interaction/Draw.js'
import VectorLayer from 'ol/layer/Vector.js'
import type BaseLayer from 'ol/layer/Base.js'
import VectorSource from 'ol/source/Vector.js'
import { Stroke, Style } from 'ol/style.js'
import { mapTheme } from '../../theme'
import type { MapLayerId, MapLayerVisibility } from '../construction-sites/map/map-layer-model'
import type { createDeferredMapFit } from '../construction-sites/map/deferred-map-fit'
import {
  canFinishRouteSketch,
  routeFocusExtent,
  routeLineGeometries,
  toDrawnRouteGeometry,
} from './route-map-model'
import type { MultiLineStringDto, RoutePathResponse } from './types'
import { createRouteNetworkLayer, pickRouteFeature } from './route-map-layer'
import { buildRouteNetwork, prepareRouteNetwork } from './route-network-model'

const selectedRouteStyle = [
  new Style({ stroke: new Stroke({ color: mapTheme.route.halo, width: 8 }) }),
  new Style({ stroke: new Stroke({ color: mapTheme.route.selectedStroke, width: 4.5 }) }),
]
interface UseRouteMapOptions {
  mapRef: RefObject<Map | null>
  mapFit: ReturnType<typeof createDeferredMapFit>
  routes: RoutePathResponse[]
  canEdit: boolean
  routeDrawingRef: RefObject<boolean>
  routeClickRef: RefObject<((pixel: number[]) => boolean) | null>
  cancelSiteEditing: () => void
  onSelectRoute?: (id: string, pathId?: string) => void
  layerVisibility: MapLayerVisibility
  revealLayer: (id: MapLayerId) => void
}

export function useRouteMap({
  mapRef,
  mapFit,
  routes,
  canEdit,
  routeDrawingRef,
  routeClickRef,
  cancelSiteEditing,
  onSelectRoute,
  layerVisibility,
  revealLayer,
}: UseRouteMapOptions) {
  const [routeSource] = useState(() => new VectorSource())
  const [networkSource] = useState(() => new VectorSource())
  const networkDataRef = useRef<ReturnType<typeof prepareRouteNetwork> | null>(null)
  const networkResolutionRef = useRef<number | null>(null)
  const [highlightSource] = useState(() => new VectorSource())
  const [draftSource] = useState(() => new VectorSource())
  const [routeDrawing, setRouteDrawingState] = useState(false)
  const [canFinishRouteDrawing, setCanFinishRouteDrawing] = useState(false)
  const drawRef = useRef<Draw | null>(null)
  const sketchRef = useRef<Feature | null>(null)
  const callbackRef = useRef<((geometry: MultiLineStringDto) => void) | null>(null)
  const canEditRef = useRef(canEdit)
  const routesRef = useRef(routes)
  const onSelectRef = useRef(onSelectRoute)
  const cancelSiteEditingRef = useRef(cancelSiteEditing)
  const visibilityRef = useRef(layerVisibility)
  const revealLayerRef = useRef(revealLayer)
  const layersRef = useRef<Partial<Record<MapLayerId, BaseLayer[]>>>({})
  visibilityRef.current = layerVisibility
  revealLayerRef.current = revealLayer
  canEditRef.current = canEdit
  routesRef.current = routes
  onSelectRef.current = onSelectRoute
  cancelSiteEditingRef.current = cancelSiteEditing

  const refreshNetwork = useCallback(() => {
    const resolution = mapRef.current?.getView().getResolution()
    const data = networkDataRef.current
    if (!visibilityRef.current.routes || !data || !resolution || !Number.isFinite(resolution)) {
      return
    }
    if (networkResolutionRef.current === resolution) {
      return
    }
    // Merge only sub-pixel overlaps for this display scale. Originals remain in
    // routeSource for picking; selected/evidence geometry is never merged.
    const lines = buildRouteNetwork(data, resolution * 0.6)
    networkSource.clear(true)
    networkSource.addFeatures(
      lines.map(
        (line) =>
          new Feature({
            geometry: new LineString(line.coordinates),
            offsetMetres: line.offsetMetres,
          }),
      ),
    )
    networkResolutionRef.current = resolution
  }, [mapRef, networkSource])

  const clearHighlights = useCallback(() => {
    highlightSource.clear()
  }, [highlightSource])

  const cancelRouteDrawing = useCallback(() => {
    routeDrawingRef.current = false
    callbackRef.current = null
    drawRef.current?.abortDrawing()
    draftSource.clear()
    setRouteDrawingState(false)
    setCanFinishRouteDrawing(false)
  }, [draftSource, routeDrawingRef])

  const focusRoute = useCallback(
    (route: RoutePathResponse, focusGeometry = true) => {
      cancelRouteDrawing()
      clearHighlights()
      revealLayerRef.current('routes')
      highlightSource.addFeatures(
        routeLineGeometries(route).map((geometry) => {
          const feature = new Feature({ geometry: new MultiLineString(geometry.coordinates) })
          feature.setStyle(selectedRouteStyle)
          return feature
        }),
      )
      if (!focusGeometry) {
        mapFit.cancel()
        return
      }
      const extent = routeFocusExtent(route)
      if (extent) {
        mapFit.request(extent, {
          maxZoom: 17,
          padding: [70, 70, 70, 70],
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
        })
      }
    },
    [cancelRouteDrawing, clearHighlights, highlightSource, mapFit],
  )

  const clearRouteFocus = useCallback(() => {
    cancelRouteDrawing()
    clearHighlights()
  }, [cancelRouteDrawing, clearHighlights])

  useEffect(() => {
    const geometries: MultiLineStringDto[] = []
    routeSource.clear()
    routeSource.addFeatures(
      routes.flatMap((route) =>
        route.paths
          .filter((path) => !route.isSuppressed && !path.isSuppressed)
          .flatMap((path) =>
            path.versions.map((version) => {
              geometries.push(version.geometry)
              const feature = new Feature({
                geometry: new MultiLineString(version.geometry.coordinates),
                routeId: route.id,
                pathId: path.id,
                title: route.title,
              })
              feature.setId(`${route.id}:${path.id}:${version.id}`)
              return feature
            }),
          ),
      ),
    )
    networkDataRef.current = prepareRouteNetwork(geometries)
    networkResolutionRef.current = null
    refreshNetwork()
  }, [routeSource, routes, refreshNetwork])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }
    const routeLayer = createRouteNetworkLayer(
      networkSource,
      mapTheme.route.stroke,
      visibilityRef.current.routes,
    )
    const highlightLayer = new VectorLayer({
      source: highlightSource,
      style: selectedRouteStyle,
      zIndex: 5,
      visible: visibilityRef.current.routes,
    })
    const draftLayer = new VectorLayer({
      source: draftSource,
      style: selectedRouteStyle,
      zIndex: 6,
      visible: visibilityRef.current.routes,
    })
    map.addLayer(routeLayer)
    map.addLayer(highlightLayer)
    map.addLayer(draftLayer)
    map.on('moveend', refreshNetwork)
    refreshNetwork()
    layersRef.current = {
      routes: [routeLayer, highlightLayer, draftLayer],
    }
    routeClickRef.current = (pixel) => {
      if (!visibilityRef.current.routes || !routeLayer.getVisible()) {
        return false
      }
      const resolution = map.getView().getResolution()
      const feature = resolution
        ? pickRouteFeature(routeSource, map.getCoordinateFromPixel(pixel), resolution * 6)
        : null
      const routeId = feature?.get('routeId') as string | undefined
      const route = routeId ? routesRef.current.find((candidate) => candidate.id === routeId) : null
      if (!route) {
        return false
      }
      const pathId = feature?.get('pathId') as string | undefined
      if (onSelectRef.current) {
        onSelectRef.current(route.id, pathId)
      } else {
        focusRoute(
          pathId ? { ...route, paths: route.paths.filter((path) => path.id === pathId) } : route,
          false,
        )
      }
      return true
    }
    return () => {
      routeClickRef.current = null
      layersRef.current = {}
      map.un('moveend', refreshNetwork)
      map.removeLayer(routeLayer)
      map.removeLayer(highlightLayer)
      map.removeLayer(draftLayer)
    }
  }, [
    draftSource,
    focusRoute,
    highlightSource,
    mapRef,
    routeClickRef,
    routeSource,
    networkSource,
    refreshNetwork,
  ])

  useEffect(() => {
    refreshNetwork()
    for (const id of Object.keys(layersRef.current) as MapLayerId[]) {
      for (const layer of layersRef.current[id] ?? []) {
        layer.setVisible(layerVisibility[id])
      }
    }
  }, [layerVisibility, refreshNetwork])

  const startRouteDrawing = useCallback(
    (callback: (geometry: MultiLineStringDto) => void) => {
      if (!canEditRef.current) {
        return
      }
      cancelSiteEditingRef.current()
      cancelRouteDrawing()
      clearHighlights()
      revealLayerRef.current('routes')
      callbackRef.current = callback
      routeDrawingRef.current = true
      setRouteDrawingState(true)
    },
    [cancelRouteDrawing, clearHighlights, routeDrawingRef],
  )

  useEffect(() => {
    if (!canEdit) {
      cancelRouteDrawing()
    }
  }, [canEdit, cancelRouteDrawing])

  useEffect(() => {
    const map = mapRef.current
    if (!routeDrawing || !canEdit || !map) {
      return
    }
    const draw = new Draw({
      type: 'LineString',
      stopClick: true,
      style: selectedRouteStyle,
      finishCondition: () => {
        const geometry = sketchRef.current?.getGeometry()
        return geometry instanceof LineString && canFinishRouteSketch(geometry.getCoordinates())
      },
    })
    const update = () => {
      const geometry = sketchRef.current?.getGeometry()
      setCanFinishRouteDrawing(
        geometry instanceof LineString && canFinishRouteSketch(geometry.getCoordinates()),
      )
    }
    draw.on('drawstart', (event) => {
      sketchRef.current = event.feature
      event.feature.getGeometry()?.on('change', update)
      update()
    })
    draw.on('drawabort', () => {
      sketchRef.current?.getGeometry()?.un('change', update)
      sketchRef.current = null
      setCanFinishRouteDrawing(false)
    })
    draw.on('drawend', (event) => {
      event.feature.getGeometry()?.un('change', update)
      sketchRef.current = null
      const geometry = event.feature.getGeometry()
      const callback = callbackRef.current
      callbackRef.current = null
      routeDrawingRef.current = false
      setRouteDrawingState(false)
      setCanFinishRouteDrawing(false)
      if (canEditRef.current && geometry instanceof LineString && callback) {
        const coordinates = geometry.getCoordinates()
        if (!canFinishRouteSketch([...coordinates, coordinates.at(-1) ?? []])) {
          return
        }
        const result = toDrawnRouteGeometry(coordinates)
        draftSource.clear()
        draftSource.addFeature(new Feature({ geometry: new MultiLineString(result.coordinates) }))
        callback(result)
      }
    })
    const cancelWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelRouteDrawing()
      }
    }
    drawRef.current = draw
    map.addInteraction(draw)
    window.addEventListener('keydown', cancelWithKeyboard)
    return () => {
      window.removeEventListener('keydown', cancelWithKeyboard)
      draw.abortDrawing()
      drawRef.current = null
      map.removeInteraction(draw)
    }
  }, [canEdit, cancelRouteDrawing, draftSource, mapRef, routeDrawing, routeDrawingRef])

  const finishRouteDrawing = useCallback(() => {
    if (canEditRef.current && canFinishRouteDrawing) {
      drawRef.current?.finishDrawing()
    }
  }, [canFinishRouteDrawing])

  return {
    clearRouteFocus,
    focusRoute,
    startRouteDrawing,
    routeDrawing,
    cancelRouteDrawing,
    finishRouteDrawing,
    canFinishRouteDrawing,
  }
}
