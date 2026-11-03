import assert from 'node:assert/strict'
import test from 'node:test'
import * as routeModel from '../src/features/routes/route-model.ts'
import {
  parseProjectedRouteGeometry,
  toRouteWriteRequest,
  routeFormIsDirty,
  createRouteDraftScope,
} from '../src/features/routes/route-model.ts'

const draft = () => ({
  title: 'Route',
  description: '',
  paths: [
    {
      key: 'local',
      title: 'West',
      validFrom: '',
      validTo: '',
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [320000, 5430000],
            [320100, 5430100],
          ],
        ],
      },
    },
  ],
})

test('discard guard compares the persisted payload, including dates and every disconnected path', () => {
  const original = draft()
  assert.equal(routeFormIsDirty(structuredClone(original), original), false)
  assert.equal(
    routeFormIsDirty({ ...original, title: ' Route ', description: ' ' }, original),
    false,
  )
  assert.equal(routeFormIsDirty({ ...original, title: 'Other route' }, original), true)
  const changedDates = structuredClone(original)
  changedDates.paths[0].validTo = '2026-12-31'
  assert.equal(routeFormIsDirty(changedDates, original), true)
  assert.equal(routeFormIsDirty({ ...original, description: 'Local notes' }, original), true)
  const changed = structuredClone(original)
  changed.paths[0].geometry.coordinates.push([
    [321000, 5430000],
    [321100, 5430100],
  ])
  assert.equal(routeFormIsDirty(changed, original), true)
  assert.equal(routeFormIsDirty({ ...original, paths: [] }, original), true)
  assert.equal(original.paths[0].geometry.coordinates.length, 1)
})

test('late map and vector callbacks cannot change a new draft or a saved draft', () => {
  const scope = createRouteDraftScope()
  const oldMap = scope.capture()
  const oldVector = scope.capture()
  assert.equal(oldMap(), true)
  scope.invalidate()
  assert.equal(oldMap(), false)
  assert.equal(oldVector(), false)
  const newMap = scope.capture()
  assert.equal(newMap(), true)
  scope.invalidate()
  assert.equal(newMap(), false)
})

test('manual write keeps concurrency and unbounded dates without mutating geometry', () => {
  const geometry = {
    type: 'MultiLineString',
    coordinates: [
      [
        [320000, 5430000],
        [320100, 5430100],
      ],
    ],
  }
  assert.deepEqual(
    toRouteWriteRequest(
      {
        title: ' Route ',
        description: ' ',
        paths: [
          {
            key: 'path',
            id: 'stable',
            title: ' West ',
            validFrom: '',
            validTo: '2026-12-31',
            geometry,
          },
        ],
      },
      9,
    ),
    {
      title: 'Route',
      description: null,
      paths: [{ id: 'stable', title: 'West', validFrom: null, validTo: '2026-12-31', geometry }],
      version: 9,
    },
  )
  assert.equal(toRouteWriteRequest(draft()).version, undefined)
})

test('grouped draft preserves child identity and independent geometry and dates', () => {
  const geometry = draft().paths[0].geometry
  const route = {
    title: 'Line 1',
    description: null,
    paths: [
      {
        id: 'weekday',
        title: 'Central – West',
        isSuppressed: false,
        versions: [{ geometry, validFrom: '2026-10-01', validTo: '2026-10-30' }],
      },
      {
        id: 'weekend',
        title: 'Central – East',
        isSuppressed: false,
        versions: [{ geometry, validFrom: '2026-11-01', validTo: '2026-11-30' }],
      },
      { id: 'hidden', title: 'Old', isSuppressed: true, versions: [{ geometry }] },
    ],
  }
  const edit = routeModel.createRouteForm(route)
  assert.deepEqual(
    edit.paths.map((path) => [path.id, path.validFrom]),
    [
      ['weekday', '2026-10-01'],
      ['weekend', '2026-11-01'],
    ],
  )
  edit.paths[0].geometry.coordinates[0][0][0] = 0
  assert.equal(geometry.coordinates[0][0][0], 320000)
  assert.equal(routeModel.routeFormIsValid(edit), true)
  assert.equal(routeModel.routeFormIsValid({ ...edit, paths: [] }), false)
  assert.equal(
    routeModel.routeFormIsValid({ ...edit, paths: [{ ...edit.paths[0], title: '' }] }),
    false,
  )
  assert.equal(
    routeModel.routeFormIsValid({ ...edit, paths: [{ ...edit.paths[0], validTo: '2026-09-01' }] }),
    false,
  )
  assert.equal(
    routeModel.routeFormIsValid({ ...edit, paths: [{ ...edit.paths[0], geometry: null }] }),
    false,
  )
})

test('path focus keeps the parent identity and excludes sibling geometries without mutation', () => {
  const route = {
    id: 'parent',
    paths: [
      { id: 'west', isSuppressed: false },
      { id: 'east', isSuppressed: false },
      { id: 'old', isSuppressed: true },
    ],
  }
  assert.deepEqual(routeModel.toRoutePathFocus(route, 'east'), {
    ...route,
    paths: [route.paths[1]],
  })
  assert.equal(routeModel.toRoutePathFocus(route, 'missing'), null)
  assert.equal(routeModel.toRoutePathFocus(route, 'old'), null)
  assert.equal(routeModel.toRoutePathFocus({ ...route, isSuppressed: true }, 'west'), null)
  assert.equal(route.paths.length, 3)
})

test('explicitly projected vector import preserves disconnected lines and rejects absent CRS', () => {
  const coordinates = [
    [
      [320000, 5430000],
      [320100, 5430100],
    ],
    [
      [321000, 5431000],
      [321100, 5431100],
    ],
  ]
  const value = {
    type: 'Feature',
    crs: { type: 'name', properties: { name: 'EPSG:25832' } },
    geometry: { type: 'MultiLineString', coordinates },
  }
  assert.deepEqual(parseProjectedRouteGeometry(value), value.geometry)
  assert.throws(() => parseProjectedRouteGeometry(value.geometry), /projection/)
  assert.throws(
    () =>
      parseProjectedRouteGeometry({
        ...value,
        geometry: {
          type: 'LineString',
          coordinates: [
            [320000, 5430000],
            [320000, 5430000],
          ],
        },
      }),
    /geometry/,
  )
  assert.throws(
    () =>
      parseProjectedRouteGeometry({
        ...value,
        geometry: {
          type: 'LineString',
          coordinates: [
            [NaN, 5430000],
            [320000, 5430000],
          ],
        },
      }),
    /geometry/,
  )
})
