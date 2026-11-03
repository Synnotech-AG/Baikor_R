import { useCallback, useEffect, useRef, useState } from 'react'
import Feature from 'ol/Feature.js'
import Map from 'ol/Map.js'
import MultiPolygon from 'ol/geom/MultiPolygon.js'
import Point from 'ol/geom/Point.js'
import Polygon from 'ol/geom/Polygon.js'
import Draw from 'ol/interaction/Draw.js'
import Modify from 'ol/interaction/Modify.js'
import Snap from 'ol/interaction/Snap.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import { transform, transformExtent } from 'ol/proj.js'
import OSM from 'ol/source/OSM.js'
import VectorSource from 'ol/source/Vector.js'
import View from 'ol/View.js'
import { compareAreaNames, getNextAreaNumber } from '../map/area-names'
import type { AddressSearchResult } from '../map/address-search-result'
import {
  addressMarkerStyle,
  editorGeometryStyle,
  savedGeometryStyle,
  selectedGeometryStyle,
} from '../map/map-configuration'
import { createDeferredMapFit } from '../map/deferred-map-fit'
import { GeometryHistory, type GeometrySnapshot } from '../map/geometry-snapshots'
import type { ConstructionSiteAreaRequest, ConstructionSiteSummary, EditorArea } from '../types'
import type { MultiLineStringDto, RoutePathResponse } from '../../routes/types'
import { useRouteMap } from '../../routes/use-route-map'
import { useMapLayers } from './use-map-layers'
import { useAlertMap } from '../../alerts/map/use-alert-map'
import type { MapLayerId } from '../map/map-layer-model'

interface UseConstructionSiteMapOptions {
  canEdit: boolean
  constructionSites: ConstructionSiteSummary[]
  selectedId: string | null
  showSelectedGeometry?: boolean
  onSelectConstructionSite: (id: string) => void
  routes?: RoutePathResponse[]
  canEditRoutes?: boolean
  onSelectRoute?: (id: string, pathId?: string) => void
  onSelectAlert?: (id: string) => void
}

const noRoutes: RoutePathResponse[] = []

export function useConstructionSiteMap({
  canEdit,
  constructionSites,
  selectedId,
  showSelectedGeometry = true,
  onSelectConstructionSite,
  routes = noRoutes,
  canEditRoutes = false,
  onSelectRoute,
  onSelectAlert,
}: UseConstructionSiteMapOptions) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const [mapFit] = useState(() => createDeferredMapFit(() => mapRef.current))
  const editorLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const savedLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const { visibility: layerVisibility, setLayerVisible, revealLayer } = useMapLayers()
  const layerVisibilityRef = useRef(layerVisibility)
  layerVisibilityRef.current = layerVisibility
  const showSelectedGeometryRef = useRef(showSelectedGeometry)
  showSelectedGeometryRef.current = showSelectedGeometry
  const modifyInteractionRef = useRef<Modify | null>(null)
  const snapInteractionRef = useRef<Snap | null>(null)
  const drawInteractionRef = useRef<Draw | null>(null)
  const routeDrawingRef = useRef(false)
  const routeClickRef = useRef<((pixel: number[]) => boolean) | null>(null)
  const alertClickRef = useRef<((pixel: number[]) => boolean) | null>(null)
  const clearAlertFocusRef = useRef<(() => void) | null>(null)
  const [alertSelectionActive, setAlertSelectionActive] = useState(false)
  const cancelRouteDrawingRef = useRef<(() => void) | null>(null)
  const sketchFeatureRef = useRef<Feature | null>(null)
  const canEditRef = useRef(canEdit)
  canEditRef.current = canEdit
  const onSelectConstructionSiteRef = useRef(onSelectConstructionSite)
  onSelectConstructionSiteRef.current = onSelectConstructionSite
  const nextAreaNumberRef = useRef(1)
  const nextLocalAreaIdRef = useRef(1)
  const [source] = useState(() => new VectorSource())
  const [savedSource] = useState(() => new VectorSource())
  const [addressSource] = useState(() => new VectorSource())
  const [drawing, setDrawingState] = useState(false)
  const [editingGeometry, setEditingGeometryState] = useState(false)
  const drawingRef = useRef(false)
  const editingGeometryRef = useRef(false)
  const [geometryHistory] = useState(() => new GeometryHistory())
  const [canUndoGeometry, setCanUndoGeometry] = useState(false)
  const [canFinishDrawing, setCanFinishDrawing] = useState(false)
  const [canUndoDrawingPoint, setCanUndoDrawingPoint] = useState(false)
  const [editorAreas, setEditorAreas] = useState<EditorArea[]>([])
  const [selectedAreaKey, setSelectedAreaKey] = useState<string | null>(null)
  const [geometryDirty, setGeometryDirty] = useState(false)

  const setDrawing = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const next =
        canEditRef.current && (typeof value === 'function' ? value(drawingRef.current) : value)
      drawingRef.current = next
      setDrawingState(next)
      if (next) {
        clearAlertFocusRef.current?.()
        revealLayer('constructionSites')
        cancelRouteDrawingRef.current?.()
        editingGeometryRef.current = false
        setEditingGeometryState(false)
      } else {
        drawInteractionRef.current?.abortDrawing()
      }
      modifyInteractionRef.current?.setActive(
        canEditRef.current && editingGeometryRef.current && !next,
      )
      snapInteractionRef.current?.setActive(
        canEditRef.current && editingGeometryRef.current && !next,
      )
    },
    [revealLayer],
  )

  const setEditingGeometry = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const next =
        canEditRef.current &&
        (typeof value === 'function' ? value(editingGeometryRef.current) : value)
      editingGeometryRef.current = next
      setEditingGeometryState(next)
      if (next) {
        clearAlertFocusRef.current?.()
        revealLayer('constructionSites')
        cancelRouteDrawingRef.current?.()
        drawingRef.current = false
        setDrawingState(false)
        drawInteractionRef.current?.abortDrawing()
      }
      modifyInteractionRef.current?.setActive(canEditRef.current && next && !drawingRef.current)
      snapInteractionRef.current?.setActive(canEditRef.current && next && !drawingRef.current)
    },
    [revealLayer],
  )

  const getSnapshot = useCallback(
    (): GeometrySnapshot =>
      source.getFeatures().map((feature) => {
        const geometry = feature.getGeometry()
        if (!(geometry instanceof Polygon)) {
          throw new Error('Only polygon areas are supported')
        }
        return {
          key: String(feature.getId()),
          id: (feature.get('areaId') as string | null | undefined) ?? null,
          name: feature.get('areaName') as string,
          coordinates: geometry
            .getCoordinates()
            .map((ring) => ring.map((coordinate) => [...coordinate])),
        }
      }),
    [source],
  )

  const updateHistoryState = useCallback(() => {
    setGeometryDirty(geometryHistory.isDirty)
    setCanUndoGeometry(geometryHistory.canUndo)
  }, [geometryHistory])

  const recordGeometry = useCallback(() => {
    geometryHistory.record(getSnapshot())
    updateHistoryState()
  }, [geometryHistory, getSnapshot, updateHistoryState])

  const updateStats = useCallback(() => {
    const areas = source
      .getFeatures()
      .map((feature) => {
        let key = String(feature.getId() ?? '')
        if (!key) {
          key = `local-area-${nextLocalAreaIdRef.current++}`
          feature.setId(key)
        }

        let name = feature.get('areaName') as string | undefined
        if (!name) {
          name = `Area ${nextAreaNumberRef.current++}`
          feature.set('areaName', name)
        }

        const geometry = feature.getGeometry()
        return {
          key,
          id: (feature.get('areaId') as string | null | undefined) ?? null,
          name,
          areaSquareMetres: geometry instanceof Polygon ? geometry.getArea() : 0,
        }
      })
      .sort((left, right) => compareAreaNames(left.name, right.name))

    setEditorAreas(areas)
    setSelectedAreaKey((current) =>
      current && areas.some((area) => area.key === current) ? current : null,
    )
  }, [source])

  const selectArea = useCallback(
    (areaKey: string, focusGeometry = true) => {
      const selectedFeature = source.getFeatureById(areaKey)
      if (!selectedFeature) {
        return
      }
      clearAlertFocusRef.current?.()

      source.getFeatures().forEach((feature) => feature.setStyle(undefined))
      selectedFeature.setStyle(selectedGeometryStyle)
      setSelectedAreaKey(areaKey)

      const geometry = selectedFeature.getGeometry()
      if (focusGeometry && geometry) {
        revealLayer('constructionSites')
        mapFit.request(geometry.getExtent(), {
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
          maxZoom: 18,
          padding: [80, 80, 80, 80],
        })
      }
    },
    [mapFit, source, revealLayer],
  )

  const loadAreas = useCallback(
    (site: ConstructionSiteSummary, focusGeometry = true) => {
      cancelRouteDrawingRef.current?.()
      mapFit.setContext(`${site.id}:${site.version}`)
      setDrawing(false)
      setEditingGeometry(false)
      setSelectedAreaKey(null)
      source.clear()
      const sortedAreas = [...site.areas].sort((left, right) =>
        compareAreaNames(left.name, right.name),
      )
      source.addFeatures(
        sortedAreas.map((area) => {
          const feature = new Feature({
            geometry: new Polygon(
              area.geometry.coordinates.map((ring) => ring.map((coordinate) => [...coordinate])),
            ),
            areaId: area.id,
            areaName: area.name,
          })
          feature.setId(area.id)
          return feature
        }),
      )
      nextAreaNumberRef.current = getNextAreaNumber(sortedAreas.map((area) => area.name))
      nextLocalAreaIdRef.current = 1
      updateStats()
      geometryHistory.reset(getSnapshot())
      updateHistoryState()

      if (focusGeometry && sortedAreas.length > 0) {
        revealLayer('constructionSites')
        const geometry = new MultiPolygon(sortedAreas.map((area) => area.geometry.coordinates))
        mapFit.request(geometry.getExtent(), {
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
          maxZoom: 17,
          padding: [70, 70, 70, 70],
        })
      } else if (focusGeometry) {
        mapFit.cancel()
      }
    },
    [
      geometryHistory,
      getSnapshot,
      mapFit,
      setDrawing,
      setEditingGeometry,
      source,
      updateHistoryState,
      updateStats,
      revealLayer,
    ],
  )

  const clearGeometry = useCallback(() => {
    clearAlertFocusRef.current?.()
    cancelRouteDrawingRef.current?.()
    mapFit.cancel()
    mapFit.setContext(null)
    setDrawing(false)
    setEditingGeometry(false)
    source.clear()
    setSelectedAreaKey(null)
    nextAreaNumberRef.current = 1
    nextLocalAreaIdRef.current = 1
    geometryHistory.reset([])
    updateHistoryState()
    updateStats()
  }, [
    geometryHistory,
    mapFit,
    setDrawing,
    setEditingGeometry,
    source,
    updateHistoryState,
    updateStats,
  ])

  const deleteArea = useCallback(
    (areaKey: string) => {
      if (!canEditRef.current || !editingGeometryRef.current || drawingRef.current) {
        return
      }
      const feature = source.getFeatureById(areaKey)
      if (!feature) {
        return
      }
      source.removeFeature(feature)
      recordGeometry()
    },
    [recordGeometry, source],
  )

  const undoGeometry = useCallback(() => {
    if (!canEditRef.current || drawingRef.current) {
      return
    }
    const snapshot = geometryHistory.undo()
    if (!snapshot) {
      return
    }
    source.clear()
    source.addFeatures(
      snapshot.map((area) => {
        const feature = new Feature({
          geometry: new Polygon(area.coordinates),
          areaId: area.id,
          areaName: area.name,
        })
        feature.setId(area.key)
        return feature
      }),
    )
    setSelectedAreaKey(null)
    updateStats()
    updateHistoryState()
  }, [geometryHistory, source, updateHistoryState, updateStats])

  const getAreaRequests = useCallback(
    (): ConstructionSiteAreaRequest[] =>
      [...source.getFeatures()]
        .sort((left, right) =>
          compareAreaNames(left.get('areaName') as string, right.get('areaName') as string),
        )
        .map((feature) => {
          const geometry = feature.getGeometry()
          if (!(geometry instanceof Polygon)) {
            throw new Error('Only polygon areas are supported')
          }
          return {
            id: (feature.get('areaId') as string | null | undefined) ?? null,
            name: feature.get('areaName') as string,
            geometry: {
              type: 'Polygon',
              coordinates: geometry
                .getCoordinates()
                .map((ring) => ring.map((coordinate) => [...coordinate])),
            },
          }
        }),
    [source],
  )

  const focusAddress = useCallback(
    (result: AddressSearchResult) => {
      const coordinate = transform([result.longitude, result.latitude], 'EPSG:4326', 'EPSG:25832')
      addressSource.clear()
      addressSource.addFeature(new Feature({ geometry: new Point(coordinate) }))

      const [south, north, west, east] = result.boundingBox
      const extent = transformExtent([west, south, east, north], 'EPSG:4326', 'EPSG:25832')
      mapFit.request(extent, {
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
        maxZoom: 18,
        padding: [80, 80, 80, 80],
      })
    },
    [addressSource, mapFit],
  )

  useEffect(() => {
    savedSource.clear()
    savedSource.addFeatures(
      constructionSites
        .filter((site) => (alertSelectionActive || site.id !== selectedId) && site.areas.length > 0)
        .map(
          (site) =>
            new Feature({
              geometry: new MultiPolygon(site.areas.map((area) => area.geometry.coordinates)),
              constructionSiteId: site.id,
              title: site.title,
            }),
        ),
    )
  }, [constructionSites, savedSource, selectedId, alertSelectionActive])

  useEffect(() => {
    if (!mapElementRef.current) {
      return
    }

    const editorLayer = new VectorLayer({
      source,
      style: canEditRef.current ? editorGeometryStyle : selectedGeometryStyle,
      visible: layerVisibilityRef.current.constructionSites && showSelectedGeometryRef.current,
    })
    const savedLayer = new VectorLayer({
      source: savedSource,
      style: savedGeometryStyle,
      visible: layerVisibilityRef.current.constructionSites,
    })
    const addressLayer = new VectorLayer({ source: addressSource, style: addressMarkerStyle })
    const map = new Map({
      target: mapElementRef.current,
      layers: [new TileLayer({ source: new OSM() }), savedLayer, editorLayer, addressLayer],
      view: new View({
        projection: 'EPSG:25832',
        center: transform([12.097, 49.019], 'EPSG:4326', 'EPSG:25832'),
        zoom: 14,
      }),
    })
    const modify = new Modify({ source })
    const snap = new Snap({ source })
    modify.setActive(false)
    snap.setActive(false)
    map.addInteraction(modify)
    map.addInteraction(snap)
    source.on('addfeature', updateStats)
    source.on('removefeature', updateStats)
    const handleFeatureChange = () => {
      if (editingGeometryRef.current) {
        setGeometryDirty(geometryHistory.hasChanges(getSnapshot()))
      }
    }
    source.on('changefeature', handleFeatureChange)
    const handleModifyEnd = () => {
      updateStats()
      recordGeometry()
    }
    modify.on('modifyend', handleModifyEnd)
    map.on('singleclick', (event) => {
      if (drawingRef.current || editingGeometryRef.current || routeDrawingRef.current) {
        return
      }
      if (alertClickRef.current?.(event.pixel) || routeClickRef.current?.(event.pixel)) {
        return
      }
      if (!layerVisibilityRef.current.constructionSites) {
        return
      }
      const editorFeature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
        layerFilter: (layer) => layer === editorLayer && editorLayer.getVisible(),
      })
      const areaKey = editorFeature?.getId()?.toString()
      if (areaKey) {
        clearAlertFocusRef.current?.()
        selectArea(areaKey, false)
        return
      }
      const savedFeature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
        layerFilter: (layer) => layer === savedLayer && savedLayer.getVisible(),
      })
      const siteId = savedFeature?.get('constructionSiteId') as string | undefined
      if (siteId) {
        onSelectConstructionSiteRef.current(siteId)
      }
    })
    mapRef.current = map
    editorLayerRef.current = editorLayer
    savedLayerRef.current = savedLayer
    modifyInteractionRef.current = modify
    snapInteractionRef.current = snap
    updateStats()
    mapFit.flush()

    return () => {
      source.un('addfeature', updateStats)
      source.un('removefeature', updateStats)
      source.un('changefeature', handleFeatureChange)
      modify.un('modifyend', handleModifyEnd)
      map.setTarget(undefined)
      mapRef.current = null
      editorLayerRef.current = null
      savedLayerRef.current = null
      modifyInteractionRef.current = null
      snapInteractionRef.current = null
      map.dispose()
    }
  }, [
    addressSource,
    geometryHistory,
    getSnapshot,
    mapFit,
    recordGeometry,
    savedSource,
    selectArea,
    source,
    updateStats,
  ])

  useEffect(() => {
    savedLayerRef.current?.setVisible(layerVisibility.constructionSites)
    editorLayerRef.current?.setVisible(
      layerVisibility.constructionSites && showSelectedGeometry && !alertSelectionActive,
    )
    editorLayerRef.current?.setStyle(canEdit ? editorGeometryStyle : selectedGeometryStyle)
  }, [showSelectedGeometry, layerVisibility.constructionSites, canEdit, alertSelectionActive])

  useEffect(() => {
    if (!canEdit) {
      setDrawing(false)
      setEditingGeometry(false)
    }
    modifyInteractionRef.current?.setActive(canEdit && editingGeometry && !drawing)
    snapInteractionRef.current?.setActive(canEdit && editingGeometry && !drawing)
  }, [canEdit, drawing, editingGeometry, setDrawing, setEditingGeometry])

  useEffect(() => {
    if (!drawing || !canEdit || !mapRef.current) {
      return
    }
    const map = mapRef.current
    const draw = new Draw({ type: 'Polygon', stopClick: true })
    const snap = new Snap({ source })
    const updateSketchState = () => {
      const geometry = sketchFeatureRef.current?.getGeometry()
      // A polygon sketch includes the moving pointer and closing coordinate.
      const placed =
        geometry instanceof Polygon ? (geometry.getCoordinates()[0] ?? []).slice(0, -2) : []
      setCanUndoDrawingPoint(placed.length > 0)
      setCanFinishDrawing(placed.length >= 3 && new Polygon([[...placed, placed[0]]]).getArea() > 0)
    }
    draw.on('drawstart', (event) => {
      sketchFeatureRef.current = event.feature
      event.feature.getGeometry()?.on('change', updateSketchState)
      setCanUndoDrawingPoint(true)
      event.feature.setId(`local-area-${nextLocalAreaIdRef.current++}`)
      event.feature.set('areaId', null)
      event.feature.set('areaName', `Area ${nextAreaNumberRef.current++}`)
    })
    draw.on('drawend', (event) => {
      event.feature.getGeometry()?.un('change', updateSketchState)
      sketchFeatureRef.current = null
      const areaKey = event.feature.getId()?.toString()
      source.addFeature(event.feature)
      recordGeometry()
      setDrawing(false)
      if (areaKey) {
        selectArea(areaKey, false)
      }
    })
    draw.on('drawabort', () => {
      sketchFeatureRef.current?.getGeometry()?.un('change', updateSketchState)
      sketchFeatureRef.current = null
      setCanUndoDrawingPoint(false)
      setCanFinishDrawing(false)
    })
    drawInteractionRef.current = draw
    map.addInteraction(draw)
    map.addInteraction(snap)
    const cancelWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      setDrawing(false)
    }
    window.addEventListener('keydown', cancelWithKeyboard)
    return () => {
      window.removeEventListener('keydown', cancelWithKeyboard)
      draw.abortDrawing()
      drawInteractionRef.current = null
      map.removeInteraction(snap)
      map.removeInteraction(draw)
      setCanFinishDrawing(false)
      setCanUndoDrawingPoint(false)
    }
  }, [canEdit, drawing, recordGeometry, selectArea, setDrawing, source])

  const finishDrawing = useCallback(() => {
    if (canEditRef.current && canFinishDrawing) {
      drawInteractionRef.current?.finishDrawing()
    }
  }, [canFinishDrawing])

  const undoDrawingPoint = useCallback(() => {
    if (canEditRef.current && drawingRef.current) {
      drawInteractionRef.current?.removeLastPoint()
    }
  }, [])

  const updateSize = useCallback(() => mapFit.flush(), [mapFit])
  const routeMap = useRouteMap({
    mapRef,
    mapFit,
    routes,
    canEdit: canEditRoutes,
    routeDrawingRef,
    routeClickRef,
    cancelSiteEditing: () => {
      setDrawing(false)
      setEditingGeometry(false)
    },
    onSelectRoute,
    layerVisibility,
    revealLayer,
  })
  cancelRouteDrawingRef.current = routeMap.cancelRouteDrawing
  const alertMap = useAlertMap({
    mapRef,
    mapFit,
    layerVisibility,
    revealLayer,
    clearRouteFocus: routeMap.clearRouteFocus,
    onSelectionChange: setAlertSelectionActive,
  })
  const { clearAlertFocus } = alertMap
  const {
    clearRouteFocus: clearRouteHighlight,
    focusRoute: focusRouteGeometry,
    startRouteDrawing: startRouteSketch,
  } = routeMap
  clearAlertFocusRef.current = alertMap.clearAlertFocus
  alertClickRef.current = (pixel) => {
    const map = mapRef.current
    const id = map ? alertMap.pickAlert(map, pixel) : null
    if (!id) {
      return false
    }
    onSelectAlert?.(id)
    return true
  }
  const clearRouteFocus = useCallback(() => {
    clearRouteHighlight()
    clearAlertFocus()
  }, [clearRouteHighlight, clearAlertFocus])
  const focusRoute = useCallback(
    (route: RoutePathResponse, focusGeometry = true) => {
      clearAlertFocus()
      focusRouteGeometry(route, focusGeometry)
    },
    [clearAlertFocus, focusRouteGeometry],
  )
  const startRouteDrawing = useCallback(
    (callback: (geometry: MultiLineStringDto) => void) => {
      clearAlertFocus()
      startRouteSketch(callback)
    },
    [clearAlertFocus, startRouteSketch],
  )
  const changeLayerVisibility = useCallback(
    (id: MapLayerId, visible: boolean) => {
      if (
        !visible &&
        ((id === 'constructionSites' && (drawingRef.current || editingGeometryRef.current)) ||
          (id === 'routes' && routeDrawingRef.current))
      ) {
        return
      }
      setLayerVisible(id, visible)
    },
    [setLayerVisible],
  )
  return {
    ...routeMap,
    ...alertMap,
    clearRouteFocus,
    focusRoute,
    startRouteDrawing,
    layerVisibility,
    changeLayerVisibility,
    mapElementRef,
    drawing,
    setDrawing,
    editingGeometry,
    setEditingGeometry,
    canUndoGeometry,
    undoGeometry,
    canFinishDrawing,
    canUndoDrawingPoint,
    finishDrawing,
    undoDrawingPoint,
    editorAreas,
    selectedAreaKey,
    geometryDirty,
    partCount: editorAreas.length,
    selectArea,
    loadAreas,
    clearGeometry,
    deleteArea,
    getAreaRequests,
    focusAddress,
    updateSize,
  }
}
