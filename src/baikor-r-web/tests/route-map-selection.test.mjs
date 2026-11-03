import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import View from 'ol/View.js'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { createDeferredMapFit } from '../src/features/construction-sites/map/deferred-map-fit.ts'

let server
let useRouteMap
let useAlertMap
const previousWindow = globalThis.window
const previousDocument = globalThis.document
const previousComputedStyle = globalThis.getComputedStyle
const route = {
  id: 'route',
  isSuppressed: false,
  paths: [
    {
      id: 'path',
      isSuppressed: false,
      versions: [
        {
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [320000, 5430000],
                [321000, 5431000],
              ],
            ],
          },
        },
      ],
    },
  ],
}

before(async () => {
  globalThis.window = { matchMedia: () => ({ matches: true }) }
  globalThis.document = { documentElement: {}, querySelector: () => null }
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#123456' })
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ useRouteMap } = await server.ssrLoadModule('/src/features/routes/use-route-map.ts'))
  ;({ useAlertMap } = await server.ssrLoadModule('/src/features/alerts/map/use-alert-map.ts'))
})

after(async () => {
  globalThis.window = previousWindow
  globalThis.document = previousDocument
  globalThis.getComputedStyle = previousComputedStyle
  await server?.close()
})

function fixture(initialSize = [800, 600]) {
  let size = initialSize
  const view = new View({ center: [100, 200], zoom: 11 })
  const map = {
    updateSize() {
      view.setViewportSize(size)
    },
    getSize() {
      return size
    },
    getView() {
      return {
        fit(extent, options) {
          view.fit(extent, { ...options, duration: undefined })
        },
      }
    },
  }
  const mapFit = createDeferredMapFit(() => map)
  const revealedLayers = []
  let api
  function Probe() {
    const routeMap = useRouteMap({
      mapRef: { current: map },
      mapFit,
      routes: [route],
      canEdit: false,
      routeDrawingRef: { current: false },
      routeClickRef: { current: null },
      cancelSiteEditing() {},
      layerVisibility: { routes: true, constructionSites: true, alerts: true },
      revealLayer(id) {
        revealedLayers.push(id)
      },
    })
    const alertMap = useAlertMap({
      mapRef: { current: map },
      mapFit,
      layerVisibility: { routes: true, constructionSites: true, alerts: true },
      revealLayer(id) {
        revealedLayers.push(id)
      },
      clearRouteFocus: routeMap.clearRouteFocus,
      onSelectionChange() {},
    })
    api = { ...routeMap, ...alertMap }
    return null
  }
  renderToStaticMarkup(React.createElement(Probe))
  return {
    api,
    mapFit,
    view,
    revealedLayers,
    setSize(next) {
      size = next
    },
  }
}

test('alert selection highlights its site and warning without revealing routes or moving a map-origin view', () => {
  const { api, view, revealedLayers } = fixture()
  const resolution = view.getResolution()
  api.focusAlert(
    {
      id: 'alert',
      location: { type: 'Point', coordinates: [320050, 5430050] },
      details: {
        routeGeometry: route.paths[0].versions[0].geometry,
        siteGeometries: [
          {
            type: 'Polygon',
            coordinates: [
              [
                [320000, 5430000],
                [320100, 5430000],
                [320100, 5430100],
                [320000, 5430000],
              ],
            ],
          },
        ],
      },
    },
    false,
  )
  assert.deepEqual(view.getCenter(), [100, 200])
  assert.equal(view.getResolution(), resolution)
  assert.equal(revealedLayers.includes('routes'), false)
})

test('map-origin route selection preserves center and zoom while explicit focus still fits', () => {
  const { api, view } = fixture()
  const resolution = view.getResolution()
  api.focusRoute(route, false)
  assert.deepEqual(view.getCenter(), [100, 200])
  assert.equal(view.getResolution(), resolution)
  api.focusRoute(route)
  assert.deepEqual(view.getCenter(), [320500, 5430500])
  assert.notEqual(view.getResolution(), resolution)
})

test('map-origin selection cancels a deferred fit instead of jumping after a later resize', () => {
  const { api, mapFit, view, setSize } = fixture([0, 0])
  mapFit.request([0, 0, 1000, 1000], { maxZoom: 17 })
  api.focusRoute(route, false)
  setSize([800, 600])
  mapFit.flush()
  assert.deepEqual(view.getCenter(), [100, 200])
  assert.equal(view.getZoom(), 11)
})

test('map-origin alert selection cancels an older deferred fit when the map becomes visible', () => {
  const { api, mapFit, view, setSize } = fixture([0, 0])
  mapFit.request([0, 0, 1000, 1000], { maxZoom: 17 })
  api.focusAlert(
    {
      id: 'alert',
      condition: 'present',
      location: { type: 'Point', coordinates: [320000, 5430000] },
      details: null,
    },
    false,
  )
  setSize([800, 600])
  mapFit.flush()
  assert.deepEqual(view.getCenter(), [100, 200])
  assert.equal(view.getZoom(), 11)
})

test('explicit alert focus still fits local evidence and reveals only alert and construction-site layers', () => {
  const { api, view, revealedLayers } = fixture()
  api.focusAlert({
    id: 'alert',
    condition: 'present',
    location: { type: 'Point', coordinates: [320000, 5430000] },
    details: null,
  })
  assert.deepEqual(view.getCenter(), [320000, 5430000])
  assert.deepEqual(revealedLayers, ['alerts'])
})

test('clearing alert selection cancels a deferred focus for a collapsed map', () => {
  const { api, mapFit, view, setSize } = fixture([0, 0])
  api.focusAlert({
    id: 'alert',
    condition: 'present',
    evidenceRevision: 1,
    location: { type: 'Point', coordinates: [320000, 5430000] },
    details: null,
  })
  api.clearAlertFocus()
  setSize([800, 600])
  mapFit.flush()
  assert.deepEqual(view.getCenter(), [100, 200])
})

test('invalidating a removed alert also cancels its deferred map focus', () => {
  const { api, mapFit, view, setSize } = fixture([0, 0])
  api.focusAlert({
    id: 'alert',
    condition: 'present',
    evidenceRevision: 1,
    location: { type: 'Point', coordinates: [320000, 5430000] },
    details: null,
  })
  api.setAlerts([])
  setSize([800, 600])
  mapFit.flush()
  assert.deepEqual(view.getCenter(), [100, 200])
})
