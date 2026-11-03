import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultMapLayerVisibility,
  mapLayerDefinitions,
  readMapLayerVisibility,
  writeMapLayerVisibility,
} from '../src/features/construction-sites/map/map-layer-model.ts'

test('new users see existing layers with the optional alerts layer initially hidden and receive independent preference objects', () => {
  const storage = { getItem: () => null }
  const first = readMapLayerVisibility(storage)
  assert.deepEqual(
    Object.keys(first),
    mapLayerDefinitions.map((layer) => layer.id),
  )
  assert.equal(first.constructionSites, true)
  assert.equal(first.routes, true)
  assert.equal(first.alerts, false)
  first.routes = false
  assert.deepEqual(readMapLayerVisibility(storage), defaultMapLayerVisibility)
})

test('layer preferences survive reloads without storing application or alert data', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  }
  writeMapLayerVisibility(storage, { constructionSites: false, routes: true, alerts: true })
  assert.equal(values.size, 1)
  assert.deepEqual(JSON.parse([...values.values()][0]), {
    version: 1,
    visibility: { constructionSites: false, routes: true, alerts: true },
  })
  assert.deepEqual(readMapLayerVisibility(storage), {
    constructionSites: false,
    routes: true,
    alerts: true,
  })
})

test('catalog reconciliation preserves known booleans and defaults missing or invalid entries', () => {
  const storage = {
    getItem: () =>
      JSON.stringify({
        version: 1,
        visibility: { constructionSites: false, routes: 'false', obsolete: false },
      }),
  }
  assert.deepEqual(readMapLayerVisibility(storage), {
    constructionSites: false,
    routes: true,
    alerts: false,
  })
  assert.deepEqual(
    readMapLayerVisibility({ getItem: () => '{"version":1,"visibility":{}}' }),
    defaultMapLayerVisibility,
  )
})

test('corrupt, incompatible, unavailable or blocked storage keeps the map usable', () => {
  for (const value of [
    'invalid',
    'null',
    '[]',
    '{"version":2,"visibility":{"routes":false}}',
    '{"version":1,"visibility":null}',
  ]) {
    assert.deepEqual(readMapLayerVisibility({ getItem: () => value }), defaultMapLayerVisibility)
  }
  const blocked = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('full')
    },
  }
  assert.deepEqual(readMapLayerVisibility(blocked), defaultMapLayerVisibility)
  assert.doesNotThrow(() => writeMapLayerVisibility(blocked, defaultMapLayerVisibility))
  assert.deepEqual(readMapLayerVisibility(), defaultMapLayerVisibility)
  assert.doesNotThrow(() => writeMapLayerVisibility(undefined, defaultMapLayerVisibility))
})
