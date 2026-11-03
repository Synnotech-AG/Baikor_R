import Feature from 'ol/Feature.js'
import type Map from 'ol/Map.js'
import Point from 'ol/geom/Point.js'
import Polygon from 'ol/geom/Polygon.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { Circle, Fill, RegularShape, Stroke, Style, Text } from 'ol/style.js'
import type { AlertDetails, AlertSelectionOrigin, AlertSummary } from '../types'

export interface AlertMapTheme {
  fill: string
  stroke: string
  text: string
  halo: string
  selectedStroke: string
  siteFill: string
  siteStroke: string
}

function markerCoordinates(location: AlertSummary['location']) {
  if (
    location?.type !== 'Point' ||
    !Array.isArray(location.coordinates) ||
    location.coordinates.length < 2 ||
    !location.coordinates.every(Number.isFinite)
  ) {
    return null
  }
  return [...location.coordinates]
}

function createMarker(alert: AlertSummary) {
  const coordinates = markerCoordinates(alert.location)
  if (!coordinates) {
    return null
  }
  const feature = new Feature({
    geometry: new Point(coordinates),
    alertId: alert.id,
  })
  feature.setId(alert.id)
  return feature
}

export function createAlertMapLayers(theme: AlertMapTheme) {
  const markers = new VectorSource()
  const selected = new VectorSource()
  const sites = new VectorSource()
  const markerStyle = (isSelected: boolean) =>
    new Style({
      image: new RegularShape({
        points: 3,
        radius: isSelected ? 20 : 16,
        fill: new Fill({ color: theme.fill }),
        stroke: new Stroke({
          color: isSelected ? theme.selectedStroke : theme.stroke,
          width: isSelected ? 4 : 2,
        }),
      }),
      text: new Text({
        text: '!',
        font: `bold ${isSelected ? 21 : 18}px sans-serif`,
        offsetY: 1,
        fill: new Fill({ color: theme.text }),
        stroke: new Stroke({ color: theme.halo, width: 1.5 }),
      }),
    })
  const markerLayer = new VectorLayer({ source: markers, zIndex: 7, style: markerStyle(false) })
  const selectedLayer = new VectorLayer({
    source: selected,
    zIndex: 9,
    style: [
      new Style({
        image: new Circle({ radius: 24, fill: new Fill({ color: theme.halo }) }),
      }),
      markerStyle(true),
    ],
  })
  const siteLayer = new VectorLayer({
    source: sites,
    zIndex: 3,
    style: new Style({
      fill: new Fill({ color: theme.siteFill }),
      stroke: new Stroke({ color: theme.siteStroke, width: 3 }),
    }),
  })
  let alerts: readonly AlertSummary[] = []
  let selectedId: string | null = null
  let selectedSnapshot: {
    id: string
    evidenceRevision: number
    condition: AlertSummary['condition']
    coordinates: number[] | null
    current: boolean
  } | null = null

  function resetSelection() {
    selected.clear()
    sites.clear()
    selectedId = null
    selectedSnapshot = null
  }

  function refreshMarkers() {
    markers.clear()
    const seenIds = new Set<string>()
    for (const alert of alerts) {
      if (alert.supersededByAlertId || alert.id === selectedId || seenIds.has(alert.id)) {
        continue
      }
      const feature = createMarker(alert)
      if (feature) {
        seenIds.add(alert.id)
        markers.addFeature(feature)
      }
    }
  }

  return {
    layers: [siteLayer, markerLayer, selectedLayer],
    setAlerts(nextAlerts: readonly AlertSummary[]) {
      alerts = [...nextAlerts]
      let selectionCleared = false
      const snapshot = selectedSnapshot
      if (snapshot?.current) {
        const currentAlert = alerts.find(
          (alert) => alert.id === snapshot.id && !alert.supersededByAlertId,
        )
        const coordinates = currentAlert ? markerCoordinates(currentAlert.location) : null
        const previousCoordinates = snapshot.coordinates
        const sameLocation =
          coordinates === null
            ? previousCoordinates === null
            : previousCoordinates !== null &&
              coordinates.length === previousCoordinates.length &&
              coordinates.every((coordinate, index) => coordinate === previousCoordinates[index])
        if (
          !currentAlert ||
          currentAlert.condition !== snapshot.condition ||
          currentAlert.evidenceRevision !== snapshot.evidenceRevision ||
          !sameLocation
        ) {
          resetSelection()
          selectionCleared = true
        }
      }
      refreshMarkers()
      return selectionCleared
    },
    selectAlert(alert: AlertDetails, origin: AlertSelectionOrigin = 'current') {
      resetSelection()
      const marker = createMarker(alert)
      selectedId = marker ? alert.id : null
      selectedSnapshot = {
        id: alert.id,
        evidenceRevision: alert.evidenceRevision,
        condition: alert.condition,
        coordinates: marker?.getGeometry()?.getCoordinates() ?? null,
        current: origin === 'current' && !alert.supersededByAlertId,
      }
      if (marker) {
        selected.addFeature(marker)
      }
      for (const geometry of alert.details?.siteGeometries ?? []) {
        sites.addFeature(
          new Feature({
            geometry: new Polygon(
              geometry.coordinates.map((ring) => ring.map((coordinate) => [...coordinate])),
            ),
          }),
        )
      }
      refreshMarkers()
    },
    clearSelection() {
      resetSelection()
      refreshMarkers()
    },
    setVisibility(visibility: { alerts: boolean; constructionSites: boolean }) {
      markerLayer.setVisible(visibility.alerts)
      selectedLayer.setVisible(visibility.alerts)
      siteLayer.setVisible(visibility.constructionSites)
    },
    pickAlert(map: Map, pixel: number[]): string | null {
      if (!markerLayer.getVisible() && !selectedLayer.getVisible()) {
        return null
      }
      return (
        map.forEachFeatureAtPixel(
          pixel,
          (feature, layer) => {
            if ((layer !== markerLayer && layer !== selectedLayer) || !layer.getVisible()) {
              return undefined
            }
            const id: unknown = feature.get('alertId')
            return typeof id === 'string' ? id : undefined
          },
          {
            hitTolerance: 4,
            layerFilter: (layer) =>
              (layer === markerLayer || layer === selectedLayer) && layer.getVisible(),
          },
        ) ?? null
      )
    },
  }
}
