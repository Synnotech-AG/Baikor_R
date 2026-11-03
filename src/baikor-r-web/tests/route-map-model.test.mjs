import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canFinishRouteSketch,
  routeFocusExtent,
  routeLineGeometries,
  toDrawnRouteGeometry,
} from '../src/features/routes/route-map-model.ts'
import { alertFocusExtent } from '../src/features/alerts/map/alert-map-model.ts'

const geometry = {
  type: 'MultiLineString',
  coordinates: [
    [
      [320000, 5430000],
      [320100, 5430100],
    ],
    [
      [321000, 5431000],
      [321100, 5431100],
    ],
  ],
}

test('map retains active child paths and all validity windows without mutating source coordinates', () => {
  const route = {
    isSuppressed: false,
    paths: [
      {
        id: 'first',
        isSuppressed: false,
        versions: [
          { geometry },
          {
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [322000, 5432000],
                  [322100, 5432100],
                ],
              ],
            },
          },
        ],
      },
      {
        id: 'hidden',
        isSuppressed: true,
        versions: [
          {
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [0, 0],
                  [1, 1],
                ],
              ],
            },
          },
        ],
      },
    ],
  }
  const rendered = routeLineGeometries(route)
  assert.equal(rendered.length, 2)
  assert.equal(rendered[0].coordinates.length, 2)
  rendered[0].coordinates[0][0][0] = 0
  assert.equal(geometry.coordinates[0][0][0], 320000)
  assert.deepEqual(routeFocusExtent(route), [320000, 5430000, 322100, 5432100])
  assert.deepEqual(routeLineGeometries({ ...route, isSuppressed: true }), [])
})

test('focusing one child path uses only that path rather than the whole parent extent', () => {
  const first = { id: 'first', isSuppressed: false, versions: [{ geometry }] }
  const second = {
    id: 'second',
    isSuppressed: false,
    versions: [
      {
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [400000, 5500000],
              [400100, 5500100],
            ],
          ],
        },
      },
    ],
  }
  const parent = { isSuppressed: false, paths: [first, second] }
  assert.deepEqual(routeFocusExtent(parent), [320000, 5430000, 400100, 5500100])
  assert.deepEqual(
    routeFocusExtent({ ...parent, paths: [second] }),
    [400000, 5500000, 400100, 5500100],
  )
  assert.equal(
    routeFocusExtent({ isSuppressed: false, paths: [{ ...second, isSuppressed: true }] }),
    null,
  )
})

test('route sketch requires two placed distinct points and returns native projected lines only', () => {
  assert.equal(
    canFinishRouteSketch([
      [1, 2],
      [1, 2],
    ]),
    false,
  )
  assert.equal(
    canFinishRouteSketch([
      [1, 2],
      [3, 4],
      [3, 4],
    ]),
    true,
  )
  assert.equal(
    canFinishRouteSketch([
      [1, 2],
      [1, 2],
      [1, 2],
    ]),
    false,
  )
  const coordinates = [
    [320000, 5430000],
    [320100, 5430100],
  ]
  const result = toDrawnRouteGeometry(coordinates)
  assert.deepEqual(result, { type: 'MultiLineString', coordinates: [coordinates] })
  result.coordinates[0][0][0] = 0
  assert.equal(coordinates[0][0], 320000)
  assert.throws(
    () =>
      toDrawnRouteGeometry([
        [1, 2],
        [1, 2],
      ]),
    /geometry/,
  )
})

test('alert focus prefers its local envelope and still supports generic nonspatial alerts', () => {
  assert.deepEqual(
    alertFocusExtent({
      focusEnvelope: [1, 2, 3, 4],
      location: { coordinates: [9, 9] },
      details: { routeGeometry: geometry },
    }),
    [1, 2, 3, 4],
  )
  assert.deepEqual(
    alertFocusExtent({ location: { coordinates: [320000, 5430000] }, details: null }),
    [320000, 5430000, 320000, 5430000],
  )
  assert.equal(alertFocusExtent({ location: null, details: null }), null)
  assert.deepEqual(
    alertFocusExtent({
      focusEnvelope: [NaN, 0, 1, 2],
      location: null,
      details: { routeGeometry: geometry, siteGeometries: [] },
    }),
    [320000, 5430000, 321100, 5431100],
  )
})
