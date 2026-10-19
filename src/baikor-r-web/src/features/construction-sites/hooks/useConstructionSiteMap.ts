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
import { compareAreaNames, getNextAreaNumber } from '../map/areaNames'
import type { AddressSearchResult } from '../map/AddressSearchResult'
import { addressMarkerStyle, editorGeometryStyle, savedGeometryStyle, selectedGeometryStyle } from '../map/mapConfiguration'
import type {
  ConstructionSiteAreaRequest,
  ConstructionSiteSummary,
  EditorArea,
} from '../types'

interface UseConstructionSiteMapOptions {
  canEdit: boolean
  constructionSites: ConstructionSiteSummary[]
  selectedId: string | null
  onSelectConstructionSite: (id: string) => void
}

export function useConstructionSiteMap({
  canEdit,
  constructionSites,
  selectedId,
  onSelectConstructionSite,
}: UseConstructionSiteMapOptions) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const modifyInteractionRef = useRef<Modify | null>(null)
  const onSelectConstructionSiteRef = useRef(onSelectConstructionSite)
  onSelectConstructionSiteRef.current = onSelectConstructionSite
  const nextAreaNumberRef = useRef(1)
  const nextLocalAreaIdRef = useRef(1)
  const [source] = useState(() => new VectorSource())
  const [savedSource] = useState(() => new VectorSource())
  const [addressSource] = useState(() => new VectorSource())
  const [drawing, setDrawing] = useState(false)
  const [editorAreas, setEditorAreas] = useState<EditorArea[]>([])
  const [selectedAreaKey, setSelectedAreaKey] = useState<string | null>(null)
  const [geometryDirty, setGeometryDirty] = useState(false)

  const updateStats = useCallback(() => {
    const areas = source.getFeatures().map((feature) => {
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
    }).sort((left, right) => compareAreaNames(left.name, right.name))

    setEditorAreas(areas)
    setSelectedAreaKey((current) =>
      current && areas.some((area) => area.key === current) ? current : null)
  }, [source])

  const selectArea = useCallback((areaKey: string, focusGeometry = true) => {
    const selectedFeature = source.getFeatureById(areaKey)
    if (!selectedFeature) return

    source.getFeatures().forEach((feature) => feature.setStyle(undefined))
    selectedFeature.setStyle(selectedGeometryStyle)
    setSelectedAreaKey(areaKey)

    const geometry = selectedFeature.getGeometry()
    if (focusGeometry && geometry && mapRef.current) {
      mapRef.current.getView().fit(geometry.getExtent(), {
        duration: 250,
        maxZoom: 18,
        padding: [80, 80, 80, 80],
      })
    }
  }, [source])

  const loadAreas = useCallback((site: ConstructionSiteSummary, focusGeometry = true) => {
    setDrawing(false)
    setSelectedAreaKey(null)
    source.clear()
    const sortedAreas = [...site.areas].sort((left, right) => compareAreaNames(left.name, right.name))
    source.addFeatures(sortedAreas.map((area) => {
      const feature = new Feature({
        geometry: new Polygon(area.geometry.coordinates),
        areaId: area.id,
        areaName: area.name,
      })
      feature.setId(area.id)
      return feature
    }))
    nextAreaNumberRef.current = getNextAreaNumber(sortedAreas.map((area) => area.name))
    nextLocalAreaIdRef.current = 1
    setGeometryDirty(false)
    updateStats()

    if (focusGeometry && sortedAreas.length > 0 && mapRef.current) {
      const geometry = new MultiPolygon(sortedAreas.map((area) => area.geometry.coordinates))
      mapRef.current.getView().fit(geometry.getExtent(), {
        duration: 250,
        maxZoom: 17,
        padding: [70, 70, 70, 70],
      })
    }
  }, [source, updateStats])

  const clearGeometry = useCallback(() => {
    source.clear()
    setDrawing(false)
    setSelectedAreaKey(null)
    nextAreaNumberRef.current = 1
    nextLocalAreaIdRef.current = 1
    setGeometryDirty(false)
    updateStats()
  }, [source, updateStats])

  const deleteArea = useCallback((areaKey: string) => {
    const feature = source.getFeatureById(areaKey)
    if (!feature) return
    source.removeFeature(feature)
    setGeometryDirty(true)
  }, [source])

  const getAreaRequests = useCallback((): ConstructionSiteAreaRequest[] =>
    [...source.getFeatures()]
      .sort((left, right) => compareAreaNames(
        left.get('areaName') as string,
        right.get('areaName') as string,
      ))
      .map((feature) => {
        const geometry = feature.getGeometry()
        if (!(geometry instanceof Polygon)) throw new Error('Only polygon areas are supported')
        return {
          id: (feature.get('areaId') as string | null | undefined) ?? null,
          name: feature.get('areaName') as string,
          geometry: { type: 'Polygon', coordinates: geometry.getCoordinates() },
        }
      }), [source])

  const focusAddress = useCallback((result: AddressSearchResult) => {
    const coordinate = transform(
      [result.longitude, result.latitude],
      'EPSG:4326',
      'EPSG:25832',
    )
    addressSource.clear()
    addressSource.addFeature(new Feature({ geometry: new Point(coordinate) }))

    const [south, north, west, east] = result.boundingBox
    const extent = transformExtent(
      [west, south, east, north],
      'EPSG:4326',
      'EPSG:25832',
    )
    mapRef.current?.getView().fit(extent, {
      duration: 300,
      maxZoom: 18,
      padding: [80, 80, 80, 80],
    })
  }, [addressSource])

  useEffect(() => {
    savedSource.clear()
    savedSource.addFeatures(constructionSites
      .filter((site) => site.id !== selectedId && site.areas.length > 0)
      .map((site) => new Feature({
        geometry: new MultiPolygon(site.areas.map((area) => area.geometry.coordinates)),
        constructionSiteId: site.id,
        title: site.title,
      })))
  }, [constructionSites, savedSource, selectedId])

  useEffect(() => {
    if (!mapElementRef.current) return

    const editorLayer = new VectorLayer({ source, style: editorGeometryStyle })
    const savedLayer = new VectorLayer({ source: savedSource, style: savedGeometryStyle })
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
    modify.setActive(canEdit)
    map.addInteraction(modify)
    map.addInteraction(snap)
    source.on('addfeature', updateStats)
    source.on('removefeature', updateStats)
    const handleModifyEnd = () => {
      updateStats()
      setGeometryDirty(true)
    }
    modify.on('modifyend', handleModifyEnd)
    map.on('singleclick', (event) => {
      const editorFeature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
        layerFilter: (layer) => layer === editorLayer,
      })
      const areaKey = editorFeature?.getId()?.toString()
      if (areaKey) {
        selectArea(areaKey, false)
        return
      }
      const savedFeature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
        layerFilter: (layer) => layer === savedLayer,
      })
      const siteId = savedFeature?.get('constructionSiteId') as string | undefined
      if (siteId) onSelectConstructionSiteRef.current(siteId)
    })
    mapRef.current = map
    modifyInteractionRef.current = modify
    updateStats()

    return () => {
      source.un('addfeature', updateStats)
      source.un('removefeature', updateStats)
      modify.un('modifyend', handleModifyEnd)
      map.setTarget(undefined)
      mapRef.current = null
      modifyInteractionRef.current = null
    }
  }, [addressSource, canEdit, savedSource, selectArea, source, updateStats])

  useEffect(() => {
    modifyInteractionRef.current?.setActive(canEdit)
  }, [canEdit])

  useEffect(() => {
    if (!drawing || !canEdit || !mapRef.current) return
    const draw = new Draw({ source, type: 'Polygon' })
    draw.on('drawstart', (event) => {
      event.feature.setId(`local-area-${nextLocalAreaIdRef.current++}`)
      event.feature.set('areaId', null)
      event.feature.set('areaName', `Area ${nextAreaNumberRef.current++}`)
    })
    draw.on('drawend', (event) => {
      const areaKey = event.feature.getId()?.toString()
      setDrawing(false)
      setGeometryDirty(true)
      if (areaKey) selectArea(areaKey, false)
    })
    mapRef.current.addInteraction(draw)
    return () => {
      mapRef.current?.removeInteraction(draw)
    }
  }, [canEdit, drawing, selectArea, source])

  const updateSize = useCallback(() => mapRef.current?.updateSize(), [])
  return {
    mapElementRef,
    drawing,
    setDrawing,
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
