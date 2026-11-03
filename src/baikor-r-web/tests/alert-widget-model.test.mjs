import assert from 'node:assert/strict'
import test from 'node:test'
import * as alertModel from '../src/features/alerts/alert-model.ts'
import { alertFocusExtent } from '../src/features/alerts/map/alert-map-model.ts'
import {
  alertHasMapTarget,
  alertPaneMode,
  buildAlertQuery,
  clampAlertDivider,
  detectionHealth,
  hasIncompleteDetectionCoverage,
  toHandlingRequest,
  toAreaFocusAlert,
  toHistoricalAlert,
} from '../src/features/alerts/alert-model.ts'

test('grouped path evidence alone enables focus and provides its complete map extent', () => {
  const alert = {
    location: null,
    focusEnvelope: null,
    details: {
      routeGeometry: null,
      siteGeometries: [],
      paths: [
        {
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [1, 2],
                [3, 4],
              ],
            ],
          },
        },
      ],
    },
  }
  assert.equal(alertHasMapTarget(alert), true)
  assert.deepEqual(alertFocusExtent(alert), [1, 2, 3, 4])
})

test('affected path map fit ignores distant site polygons while retaining their evidence context', () => {
  const path = {
    pathId: 'west',
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [320000, 5430000],
          [320100, 5430100],
        ],
      ],
    },
    periods: [{ from: '2026-10-05', to: '2026-10-09' }],
  }
  const siteGeometries = [
    {
      type: 'Polygon',
      coordinates: [
        [
          [320000, 5430000],
          [320050, 5430000],
          [320000, 5430050],
          [320000, 5430000],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [419950, 5529950],
          [420000, 5529950],
          [420000, 5530000],
          [419950, 5529950],
        ],
      ],
    },
  ]
  const alert = {
    evidenceRevision: 7,
    location: { type: 'Point', coordinates: [420000, 5530000] },
    focusEnvelope: [320000, 5430000, 420000, 5530000],
    details: { paths: [path], routeGeometry: path.geometry, siteGeometries },
  }
  const focused = alertModel.toPathFocusAlert(alert, 0)
  assert.deepEqual(alertFocusExtent(focused), [320000, 5430000, 320100, 5430100])
  assert.equal(focused.details.siteGeometries, siteGeometries)
  assert.equal(focused.details.paths[0].periods, path.periods)
  focused.focusEnvelope[0] = 0
  assert.equal(alert.focusEnvelope[0], 320000)
  assert.equal(path.geometry.coordinates[0][0][0], 320000)
})

test('affected path focus uses only that retained geometry and availability', () => {
  const west = {
    pathId: 'west',
    pathTitle: 'West',
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [320000, 5430000],
          [320100, 5430100],
        ],
      ],
    },
    validFrom: '2026-10-01',
    validTo: null,
    hasOperatingCalendar: true,
    periods: [{ from: '2026-10-05', to: '2026-10-09' }],
  }
  const alert = {
    id: 'parent-case',
    evidenceRevision: 7,
    location: { coordinates: [0, 0] },
    focusEnvelope: [0, 0, 999999, 9999999],
    details: {
      paths: [west, { ...west, pathId: 'east', periods: [] }],
      routeGeometry: null,
      siteGeometries: [],
    },
  }
  const focus = alertModel.toPathFocusAlert(alert, 0)
  assert.deepEqual(focus.details.routeGeometry, west.geometry)
  assert.deepEqual(focus.details.paths, [west])
  assert.equal(focus.evidenceRevision, 7)
  assert.deepEqual(focus.location, alert.location)
  assert.deepEqual(focus.focusEnvelope, [320000, 5430000, 320100, 5430100])
  assert.equal(alert.details.paths.length, 2)
  assert.equal(alertModel.toPathFocusAlert(alert, 9), null)
  assert.equal(
    alertModel.toPathFocusAlert({ ...alert, details: { paths: [{ ...west, geometry: null }] } }, 0),
    null,
  )
})

test('historical map focus uses retained evidence without altering the current review', () => {
  const current = {
    id: 'alert',
    version: 12,
    evidenceRevision: 4,
    handling: 'handled',
    location: null,
    details: null,
    events: [{ id: 'current' }],
  }
  const history = {
    alertId: 'alert',
    type: 'routeConflict',
    evidenceRevision: 1,
    createdAt: '2026-10-01T10:00:00Z',
    location: { type: 'Point', coordinates: [320000, 5430000] },
    focusEnvelope: [319990, 5429990, 320010, 5430010],
    details: { routeTitle: 'Old route', areas: [], routeGeometry: null, siteGeometries: [] },
  }
  const result = toHistoricalAlert(current, history)
  assert.equal(result.evidenceRevision, 1)
  assert.equal(result.details.routeTitle, 'Old route')
  assert.deepEqual(result.location, history.location)
  assert.deepEqual(result.events, [])
  assert.equal(current.evidenceRevision, 4)
  assert.equal(current.handling, 'handled')
  assert.equal(current.details, null)
  assert.equal(current.events.length, 1)
  result.location.coordinates[0] = 0
  result.focusEnvelope[0] = 0
  assert.equal(history.location.coordinates[0], 320000)
  assert.equal(history.focusEnvelope[0], 319990)
})

test('area map targets replace only local focus while retaining route and site evidence', () => {
  const area = {
    id: 'west',
    name: 'West',
    location: { type: 'Point', coordinates: [320000, 5430000] },
    focusEnvelope: [319990, 5429990, 320010, 5430010],
  }
  const alert = {
    id: 'alert',
    location: { type: 'Point', coordinates: [321000, 5430000] },
    focusEnvelope: [320000, 5430000, 322000, 5431000],
    evidenceRevision: 7,
    version: 12,
    details: {
      areas: [area],
      routeGeometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [320000, 5430000],
            [321000, 5430000],
          ],
        ],
      },
      siteGeometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [320000, 5430000],
              [320100, 5430000],
              [320000, 5430000],
            ],
          ],
        },
      ],
    },
  }
  const focused = toAreaFocusAlert(alert, 'west')
  assert.deepEqual(focused.location, area.location)
  assert.deepEqual(focused.focusEnvelope, area.focusEnvelope)
  assert.equal(focused.details, alert.details)
  assert.equal(focused.evidenceRevision, 7)
  assert.equal(focused.version, 12)
  focused.location.coordinates[0] = 0
  focused.focusEnvelope[0] = 0
  assert.equal(area.location.coordinates[0], 320000)
  assert.equal(area.focusEnvelope[0], 319990)
  assert.equal(toAreaFocusAlert(alert, 'missing'), null)
  assert.equal(
    toAreaFocusAlert(
      {
        ...alert,
        details: { ...alert.details, areas: [{ id: 'unknown', name: 'No local target' }] },
      },
      'unknown',
    ),
    null,
  )
})

test('eligible sites without areas keep coverage incomplete despite a successful evaluation', () => {
  assert.equal(hasIncompleteDetectionCoverage(null), false)
  assert.equal(hasIncompleteDetectionCoverage({ unassessableSiteCount: 0 }), false)
  assert.equal(
    hasIncompleteDetectionCoverage({
      unassessableSiteCount: 3,
      pendingCount: 0,
      failedCount: 0,
      lastEvaluatedAt: '2026-10-28',
    }),
    true,
  )
})

test('filters combine server-side and all does not become a real filter', () => {
  assert.deepEqual(
    buildAlertQuery({ search: ' bridge ', type: 'all', condition: 'present', handling: 'all' }, 3),
    { search: 'bridge', condition: 'present', page: 3, pageSize: 25 },
  )
  assert.deepEqual(
    buildAlertQuery(
      { search: '', type: 'route-conflict', condition: 'all', handling: 'handled' },
      1,
    ),
    { type: 'route-conflict', handling: 'handled', page: 1, pageSize: 25 },
  )
})

test('date range filters retain ISO calendar days alongside the quick period filter', () => {
  assert.deepEqual(
    buildAlertQuery(
      {
        search: '',
        type: 'all',
        condition: 'all',
        handling: 'all',
        period: 'upcoming',
        from: '2026-11-02',
        to: '2026-11-30',
      },
      2,
    ),
    { period: 'upcoming', from: '2026-11-02', to: '2026-11-30', page: 2, pageSize: 25 },
  )
})

test('open date ranges omit only the unbounded endpoint', () => {
  const filters = { search: '', type: 'all', condition: 'all', handling: 'all' }
  for (const [range, expected] of [
    [{ from: '2026-11-02', to: null }, { from: '2026-11-02' }],
    [{ from: null, to: '2026-11-30' }, { to: '2026-11-30' }],
    [{ from: '', to: '' }, {}],
    [{ from: null, to: null }, {}],
    [{}, {}],
  ]) {
    assert.deepEqual(buildAlertQuery({ ...filters, ...range }, 1), {
      ...expected,
      page: 1,
      pageSize: 25,
    })
  }
})

test('shared initial filters query present open alerts without restricting their dates', () => {
  assert.deepEqual(buildAlertQuery(alertModel.defaultAlertFilters, 1), {
    condition: 'present',
    handling: 'open',
    page: 1,
    pageSize: 25,
  })
})

test('handling submits the exact evidence and concurrency version visible to the reviewer', () => {
  assert.deepEqual(
    toHandlingRequest({ evidenceRevision: 7, version: 12 }, 'handled', ' checked '),
    { handling: 'handled', note: 'checked', evidenceRevision: 7, version: 12 },
  )
  assert.equal(toHandlingRequest({ evidenceRevision: 8, version: 13 }, 'open', ' ').note, null)
})

test('current and upcoming filters are delegated to the server with disjoint calendar semantics', () => {
  assert.equal(
    buildAlertQuery(
      { search: '', type: 'all', condition: 'present', handling: 'all', period: 'upcoming' },
      1,
    ).period,
    'upcoming',
  )
  assert.equal(
    buildAlertQuery(
      { search: '', type: 'all', condition: 'present', handling: 'all', period: 'all' },
      1,
    ).period,
    undefined,
  )
})

test('compact list/details navigation and saved divider stay usable at narrow widths', () => {
  assert.equal(alertPaneMode(500, false), 'list')
  assert.equal(alertPaneMode(500, true), 'details')
  assert.equal(alertPaneMode(900, true), 'split')
  assert.equal(clampAlertDivider(2), 28)
  assert.equal(clampAlertDivider(99), 70)
  assert.equal(clampAlertDivider(NaN), 46)
})

test('generic alerts need no subjects or map target; concrete snapshots enable focus', () => {
  assert.equal(alertHasMapTarget({ location: null, details: null }), false)
  assert.equal(
    alertHasMapTarget({ location: null, details: null, focusEnvelope: [1, 2, 3, 4] }),
    true,
  )
  assert.equal(
    alertHasMapTarget({ location: { type: 'Point', coordinates: [320000, 5430000] } }),
    true,
  )
  assert.equal(
    alertHasMapTarget({
      details: {
        routeGeometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [1, 2],
              [3, 4],
            ],
          ],
        },
      },
    }),
    true,
  )
})

test('empty results cannot imply an all-clear while evaluation is unknown, pending or failed', () => {
  assert.equal(detectionHealth(null), 'unknown')
  assert.equal(
    detectionHealth({ pendingCount: 0, failedCount: 0, lastEvaluatedAt: null }),
    'unknown',
  )
  assert.equal(
    detectionHealth({ pendingCount: 2, failedCount: 0, lastEvaluatedAt: '2026-10-28' }),
    'pending',
  )
  assert.equal(
    detectionHealth({ pendingCount: 2, failedCount: 1, lastEvaluatedAt: '2026-10-28' }),
    'failed',
  )
  assert.equal(
    detectionHealth({ pendingCount: 0, failedCount: 0, lastEvaluatedAt: '2026-10-28' }),
    'current',
  )
})

test('failed work takes health priority while paused detectors never appear current or merely pending', () => {
  const paused = {
    pendingCount: 0,
    failedCount: 0,
    lastEvaluatedAt: '2026-10-28',
    pausedTypes: ['routeConflict'],
  }
  assert.equal(detectionHealth(paused), 'paused')
  assert.equal(detectionHealth({ ...paused, pendingCount: 2 }), 'paused')
  assert.equal(detectionHealth({ ...paused, failedCount: 1 }), 'failed')
})
