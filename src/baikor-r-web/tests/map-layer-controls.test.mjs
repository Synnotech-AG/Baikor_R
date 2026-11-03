import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import {
  mapLayerDe,
  mapLayerEn,
} from '../src/features/construction-sites/map/map-layer-messages.ts'

let server
let ConstructionSiteMap
let MapLayerOptions
const i18n = createInstance()
const noop = () => {}

before(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    keySeparator: false,
    resources: {
      de: { translation: mapLayerDe },
      en: { translation: mapLayerEn },
    },
  })
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ ConstructionSiteMap } = await server.ssrLoadModule(
    '/src/features/construction-sites/components/construction-site-map.tsx',
  ))
  ;({ MapLayerOptions } = await server.ssrLoadModule(
    '/src/features/construction-sites/components/map-layer-control.tsx',
  ))
})

test('layer options show stored checkbox visibility and lock only the layer being edited', () => {
  const html = render(MapLayerOptions, {
    visibility: { constructionSites: false, routes: true },
    disabledIds: ['routes'],
    onChange: noop,
  })
  const inputs = [...html.matchAll(/<input\b([^>]+)>/g)].map(([, attributes]) => attributes)
  assert.equal(inputs.length, 3)
  assert.equal(inputs[0].includes('checked'), false)
  assert.equal(inputs[0].includes('disabled'), false)
  assert.equal(inputs[1].includes('checked'), true)
  assert.equal(inputs[1].includes('disabled'), true)
  assert.match(html, /Construction sites/)
  assert.match(html, /Routes/)
  assert.match(html, /Alerts/)
  assert.match(html, /map-layer-swatch warning/)
  assert.match(html, /map-layer-swatch area/)
  assert.match(html, /map-layer-swatch line/)
})

test('hiding a source removes its legend entry without hiding the layer controls', () => {
  const html = render(ConstructionSiteMap, {
    mapElementRef: { current: null },
    drawing: false,
    editingGeometry: false,
    onSelectAddress: noop,
    onCancelDrawing: noop,
    onFinishDrawing: noop,
    layerVisibility: { constructionSites: true, routes: false },
    onLayerVisibilityChange: noop,
  })
  assert.match(html, /map-legend-swatch saved/)
  assert.doesNotMatch(html, /map-legend-swatch route/)
  assert.match(html, /aria-label="Layers"/)
})

after(async () => {
  await server?.close()
})

function render(Component, props) {
  return renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(Component, props)),
  )
}

test('read-only map exposes a layer control independently from geometry permissions', () => {
  const html = render(ConstructionSiteMap, {
    mapElementRef: { current: null },
    drawing: false,
    editingGeometry: false,
    canEditGeometry: false,
    onSelectAddress: noop,
    onCancelDrawing: noop,
    onFinishDrawing: noop,
  })
  assert.match(html, /aria-label="Layers"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /map-legend-swatch route/)
})

test('hiding every source leaves no empty legend box but keeps the layer control', () => {
  const html = render(ConstructionSiteMap, {
    mapElementRef: { current: null },
    drawing: false,
    editingGeometry: false,
    onSelectAddress: noop,
    onCancelDrawing: noop,
    onFinishDrawing: noop,
    layerVisibility: { constructionSites: false, routes: false },
  })
  assert.doesNotMatch(html, /class="map-legend"/)
  assert.match(html, /aria-label="Layers"/)
})

test('map toolbar omits the redundant fit-all action', () => {
  const html = render(ConstructionSiteMap, {
    mapElementRef: { current: null },
    drawing: false,
    editingGeometry: false,
    onSelectAddress: noop,
    onCancelDrawing: noop,
    onFinishDrawing: noop,
    onFitResults: noop,
  })
  assert.doesNotMatch(html, /map-fit-results/)
  assert.match(html, /aria-label="Layers"/)
})

test('alert-only layer uses the warning legend rather than the route symbol', () => {
  const html = render(ConstructionSiteMap, {
    mapElementRef: { current: null },
    drawing: false,
    editingGeometry: false,
    onSelectAddress: noop,
    onCancelDrawing: noop,
    onFinishDrawing: noop,
    layerVisibility: { constructionSites: false, routes: false, alerts: true },
  })
  assert.match(html, /map-legend-swatch warning/)
  assert.match(html, /Alerts/)
  assert.doesNotMatch(html, /map-legend-swatch route/)
})
