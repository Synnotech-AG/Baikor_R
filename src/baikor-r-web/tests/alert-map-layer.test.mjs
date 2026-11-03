import assert from 'node:assert/strict'
import test from 'node:test'
import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import { createAlertMapLayers } from '../src/features/alerts/map/alert-map-layer.ts'
import { toHistoricalAlert } from '../src/features/alerts/alert-model.ts'
import {
  filterAlertsForDay,
  filterAlertsForWindow,
  timelineWindowAt,
} from '../src/features/alerts/live/alert-timeline-model.ts'

const theme = {
  fill: '#ffcf35',
  stroke: '#332814',
  text: '#211900',
  halo: '#ffffff',
  selectedStroke: '#275ac5',
  siteFill: 'rgba(240, 135, 20, 0.25)',
  siteStroke: '#ac5712',
}

function summary(overrides = {}) {
  return {
    id: 'alert-a',
    type: 'route-construction-conflict',
    summary: 'A route crosses a construction site',
    description: null,
    condition: 'present',
    handling: 'open',
    occurrence: 1,
    evidenceRevision: 1,
    location: { type: 'Point', coordinates: [320000, 5430000] },
    createdAt: '2026-11-01T12:00:00Z',
    updatedAt: '2026-11-01T12:00:00Z',
    lastEvaluatedAt: '2026-11-01T12:00:00Z',
    version: 1,
    ...overrides,
  }
}

function details(overrides = {}) {
  return {
    ...summary(),
    details: {
      routeId: 'route',
      routeTitle: 'Route',
      constructionSiteId: 'site',
      constructionSiteTitle: 'Site',
      distanceMetres: 0,
      sensitivityMetres: 10,
      periods: [],
      areas: [],
      routeGeometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [0, 0],
            [100, 100],
          ],
        ],
      },
      paths: [
        {
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [200, 200],
                [300, 300],
              ],
            ],
          },
        },
      ],
      siteGeometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [20, 0],
              [20, 20],
              [0, 0],
            ],
          ],
        },
      ],
    },
    events: [],
    ...overrides,
  }
}

function layers(api) {
  return {
    markers: api.layers.find((layer) => layer.getZIndex() === 7),
    selected: api.layers.find((layer) => layer.getZIndex() === 9),
    sites: api.layers.find((layer) => layer.getZIndex() === 3),
  }
}

function styles(layer, feature) {
  const result = layer.getStyleFunction()(feature, 1)
  return Array.isArray(result) ? result : [result]
}

test('present alerts have a readable warning triangle and retain their click identity', () => {
  const api = createAlertMapLayers(theme)
  assert.equal(api.layers.length, 3)
  assert.ok(api.layers.every((layer) => layer instanceof VectorLayer))
  const { markers } = layers(api)
  api.setAlerts([summary()])
  const [feature] = markers.getSource().getFeatures()
  assert.equal(feature.get('alertId'), 'alert-a')
  assert.deepEqual(feature.getGeometry().getCoordinates(), [320000, 5430000])
  const [style] = styles(markers, feature)
  assert.equal(style.getImage().getPoints(), 3)
  assert.ok(style.getImage().getRadius() >= 15)
  assert.equal(style.getImage().getFill().getColor(), '#ffcf35')
  assert.equal(style.getImage().getStroke().getColor(), '#332814')
  assert.equal(style.getText().getText(), '!')
  assert.equal(style.getText().getFill().getColor(), '#211900')
})

test('queried alert markers include cleared results but exclude superseded and invalid points and deduplicate ids', () => {
  const api = createAlertMapLayers(theme)
  const { markers } = layers(api)
  api.setAlerts([
    summary(),
    summary(),
    summary({ id: 'acknowledged', handling: 'acknowledged' }),
    summary({ id: 'handled', handling: 'handled' }),
    summary({ id: 'cleared', condition: 'cleared' }),
    summary({ id: 'superseded', supersededByAlertId: 'newer' }),
    summary({ id: 'missing', location: null }),
    summary({ id: 'wrong-type', location: { type: 'Polygon', coordinates: [1, 2] } }),
    summary({ id: 'nan', location: { type: 'Point', coordinates: [NaN, 2] } }),
    summary({ id: 'infinity', location: { type: 'Point', coordinates: [1, Infinity] } }),
    summary({ id: 'short', location: { type: 'Point', coordinates: [1] } }),
    summary({ id: 'invalid-array', location: { type: 'Point', coordinates: null } }),
  ])
  assert.deepEqual(
    markers
      .getSource()
      .getFeatures()
      .map((feature) => feature.get('alertId')),
    ['alert-a', 'acknowledged', 'handled', 'cleared'],
  )
  api.setAlerts([])
  assert.equal(markers.getSource().getFeatures().length, 0)
})

test('explicit selection shows historical alert and copied site evidence without route geometry', () => {
  const api = createAlertMapLayers(theme)
  const { markers, selected, sites } = layers(api)
  const alert = details({ condition: 'cleared', supersededByAlertId: 'successor' })
  api.setAlerts([summary(), summary({ id: 'alert-b' })])
  api.selectAlert(alert)
  assert.deepEqual(
    markers
      .getSource()
      .getFeatures()
      .map((feature) => feature.get('alertId')),
    ['alert-b'],
  )
  const [marker] = selected.getSource().getFeatures()
  assert.equal(marker.get('alertId'), 'alert-a')
  const selectedStyles = styles(selected, marker)
  const selectedTriangle = selectedStyles.find((style) => style.getImage()?.getPoints?.() === 3)
  assert.ok(selectedTriangle.getImage().getRadius() > 16)
  assert.equal(selectedTriangle.getImage().getStroke().getColor(), '#275ac5')
  assert.equal(selectedTriangle.getText().getText(), '!')
  assert.ok(selectedStyles.some((style) => style.getImage()?.getFill()?.getColor() === '#ffffff'))
  assert.equal(sites.getSource().getFeatures().length, 1)
  const [site] = sites.getSource().getFeatures()
  assert.equal(site.getGeometry().getType(), 'Polygon')
  assert.equal(styles(sites, site)[0].getFill().getColor(), theme.siteFill)
  assert.deepEqual(
    api.layers
      .flatMap((layer) =>
        layer
          .getSource()
          .getFeatures()
          .map((feature) => feature.getGeometry().getType()),
      )
      .sort(),
    ['Point', 'Point', 'Polygon'],
  )
  alert.location.coordinates[0] = -1
  alert.details.siteGeometries[0].coordinates[0][0][0] = -2
  assert.deepEqual(marker.getGeometry().getCoordinates(), [320000, 5430000])
  assert.deepEqual(site.getGeometry().getCoordinates(), [
    [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 0],
    ],
  ])
})

test('selection replacement clears old evidence and clearSelection restores current alerts', () => {
  const api = createAlertMapLayers(theme)
  const { markers, selected, sites } = layers(api)
  api.setAlerts([summary()])
  api.selectAlert(details())
  api.setAlerts([summary(), summary({ id: 'new-alert' })])
  api.selectAlert(details({ id: 'different', location: null, details: null }))
  assert.equal(selected.getSource().getFeatures().length, 0)
  assert.equal(sites.getSource().getFeatures().length, 0)
  api.selectAlert(details())
  api.clearSelection()
  assert.equal(selected.getSource().getFeatures().length, 0)
  assert.equal(sites.getSource().getFeatures().length, 0)
  assert.deepEqual(
    markers
      .getSource()
      .getFeatures()
      .map((feature) => feature.get('alertId')),
    ['alert-a', 'new-alert'],
  )
})

for (const [change, updatedAlerts, expectedMarkerIds] of [
  ['absent', [], []],
  ['cleared', [summary({ condition: 'cleared' })], ['alert-a']],
  ['superseded', [summary({ supersededByAlertId: 'successor' })], []],
  ['new evidence', [summary({ evidenceRevision: 2 })], ['alert-a']],
  [
    'moved location',
    [summary({ location: { type: 'Point', coordinates: [321000, 5431000] } })],
    ['alert-a'],
  ],
]) {
  test(`refresh clears current selected evidence when the alert is ${change}`, () => {
    const api = createAlertMapLayers(theme)
    const { markers, selected, sites } = layers(api)
    api.setAlerts([summary()])
    api.selectAlert(details({ evidenceRevisions: [1] }))
    const selectionCleared = api.setAlerts(updatedAlerts)
    assert.equal(selected.getSource().getFeatures().length, 0)
    assert.equal(sites.getSource().getFeatures().length, 0)
    assert.equal(selectionCleared, true)
    assert.deepEqual(
      markers
        .getSource()
        .getFeatures()
        .map((feature) => feature.get('alertId')),
      expectedMarkerIds,
    )
    if (change === 'moved location') {
      assert.deepEqual(
        markers.getSource().getFeatures()[0].getGeometry().getCoordinates(),
        [321000, 5431000],
      )
    }
    assert.equal(api.setAlerts(updatedAlerts), false)
  })
}

test('review-only refresh preserves current selected marker and site evidence', () => {
  const api = createAlertMapLayers(theme)
  const { selected, sites } = layers(api)
  assert.equal(api.setAlerts([summary()]), false)
  const alert = details({ evidenceRevisions: [1] })
  api.selectAlert(alert)
  const marker = selected.getSource().getFeatures()[0]
  const site = sites.getSource().getFeatures()[0]
  alert.location.coordinates[0] = -1
  alert.evidenceRevision = 5
  assert.equal(api.setAlerts([summary({ handling: 'handled', version: 2 })]), false)
  assert.equal(selected.getSource().getFeatures()[0], marker)
  assert.equal(sites.getSource().getFeatures()[0], site)
})

for (const [kind, overrides] of [
  ['superseded', { supersededByAlertId: 'successor' }],
  ['historical', { evidenceRevision: 1, evidenceRevisions: [2, 1] }],
]) {
  test(`refresh preserves an explicitly selected ${kind} evidence snapshot`, () => {
    const api = createAlertMapLayers(theme)
    const { selected, sites } = layers(api)
    api.setAlerts([summary()])
    api.selectAlert(details(overrides), kind === 'historical' ? 'historical' : 'current')
    const marker = selected.getSource().getFeatures()[0]
    const site = sites.getSource().getFeatures()[0]
    assert.equal(api.setAlerts([]), false)
    assert.equal(
      api.setAlerts([
        summary({
          evidenceRevision: 3,
          location: { type: 'Point', coordinates: [321000, 5431000] },
        }),
      ]),
      false,
    )
    assert.equal(selected.getSource().getFeatures()[0], marker)
    assert.equal(sites.getSource().getFeatures()[0], site)
    assert.deepEqual(marker.getGeometry().getCoordinates(), [320000, 5430000])
  })
}

test('the latest revision opened as historical evidence stays a snapshot after new evidence arrives', () => {
  const api = createAlertMapLayers(theme)
  const { selected, sites } = layers(api)
  const current = details({ evidenceRevisions: [1] })
  const historical = toHistoricalAlert(current, {
    alertId: current.id,
    type: current.type,
    evidenceRevision: 1,
    createdAt: current.createdAt,
    location: current.location,
    details: current.details,
  })
  api.setAlerts([summary()])
  api.selectAlert(historical, 'historical')
  const marker = selected.getSource().getFeatures()[0]
  const site = sites.getSource().getFeatures()[0]

  assert.equal(api.setAlerts([summary({ evidenceRevision: 2 })]), false)
  assert.equal(selected.getSource().getFeatures()[0], marker)
  assert.equal(sites.getSource().getFeatures()[0], site)
  assert.equal(api.setAlerts([]), false)
  assert.equal(selected.getSource().getFeatures()[0], marker)
})

test('picking accepts only visible alert marker layers and never site evidence', () => {
  const api = createAlertMapLayers(theme)
  const { markers, selected, sites } = layers(api)
  api.setAlerts([summary()])
  api.selectAlert(details({ id: 'selected-alert' }))
  const unrelatedLayer = new VectorLayer()
  const unrelatedFeature = new Feature({ geometry: new Point([1, 2]), alertId: 'unrelated' })
  const map = {
    forEachFeatureAtPixel(pixel, callback, options) {
      assert.deepEqual(pixel, [50, 60])
      assert.equal(options.layerFilter(unrelatedLayer), false)
      assert.equal(options.layerFilter(sites), false)
      assert.equal(options.layerFilter(markers), markers.getVisible())
      assert.equal(options.layerFilter(selected), selected.getVisible())
      assert.equal(callback(unrelatedFeature, unrelatedLayer), undefined)
      return callback(selected.getSource().getFeatures()[0], selected)
    },
  }
  assert.equal(api.pickAlert(map, [50, 60]), 'selected-alert')
  api.clearSelection()
  map.forEachFeatureAtPixel = (_pixel, callback, options) => {
    assert.equal(options.layerFilter(markers), true)
    return callback(markers.getSource().getFeatures()[0], markers)
  }
  assert.equal(api.pickAlert(map, [50, 60]), 'alert-a')
})

test('layer visibility hides markers and picking together while site visibility is independent', () => {
  const api = createAlertMapLayers(theme)
  const { markers, selected, sites } = layers(api)
  api.selectAlert(details())
  api.setVisibility({ alerts: false, constructionSites: true })
  assert.equal(markers.getVisible(), false)
  assert.equal(selected.getVisible(), false)
  assert.equal(sites.getVisible(), true)
  assert.equal(
    api.pickAlert(
      {
        forEachFeatureAtPixel() {
          assert.fail('Hidden alerts must not be picked')
        },
      },
      [1, 2],
    ),
    null,
  )
  api.setVisibility({ alerts: true, constructionSites: false })
  assert.equal(markers.getVisible(), true)
  assert.equal(selected.getVisible(), true)
  assert.equal(sites.getVisible(), false)
})

test('cleared alert selection follows the filtered result and disappears when no longer matched', () => {
  const api = createAlertMapLayers(theme)
  const { selected, sites } = layers(api)
  const cleared = summary({ condition: 'cleared' })
  api.setAlerts([cleared])
  api.selectAlert(details({ condition: 'cleared' }))
  assert.equal(api.setAlerts([cleared]), false)
  assert.equal(selected.getSource().getFeatures().length, 1)
  assert.equal(api.setAlerts([]), true)
  assert.equal(selected.getSource().getFeatures().length, 0)
  assert.equal(sites.getSource().getFeatures().length, 0)
})

test('live dates update actual warning features and clear evidence outside the selected day', () => {
  const api = createAlertMapLayers(theme)
  const { markers, selected, sites } = layers(api)
  const monday = summary({ id: 'monday', periods: [{ from: '2026-11-02', to: '2026-11-02' }] })
  const wednesday = summary({
    id: 'wednesday',
    periods: [{ from: '2026-11-04', to: '2026-11-04' }],
  })
  const alerts = [monday, wednesday]
  api.setAlerts(filterAlertsForDay(alerts, '2026-11-02'))
  assert.deepEqual(
    markers
      .getSource()
      .getFeatures()
      .map((feature) => feature.getId()),
    ['monday'],
  )
  api.selectAlert(details({ ...monday }))
  assert.equal(selected.getSource().getFeatures().length, 1)
  assert.equal(api.setAlerts(filterAlertsForDay(alerts, '2026-11-04')), true)
  assert.equal(selected.getSource().getFeatures().length, 0)
  assert.equal(sites.getSource().getFeatures().length, 0)
  assert.deepEqual(
    markers
      .getSource()
      .getFeatures()
      .map((feature) => feature.getId()),
    ['wednesday'],
  )
  api.setAlerts(filterAlertsForDay(alerts, '2026-11-03'))
  assert.equal(markers.getSource().getFeatures().length, 0)
  api.setAlerts(filterAlertsForDay(alerts, null))
  assert.deepEqual(
    markers
      .getSource()
      .getFeatures()
      .map((feature) => feature.getId())
      .sort(),
    ['monday', 'wednesday'],
  )
})

test('a three-day viewing window renders every affected warning while the cursor still moves daily', () => {
  const api = createAlertMapLayers(theme)
  const { markers } = layers(api)
  const monday = summary({ id: 'monday', periods: [{ from: '2026-11-02', to: '2026-11-02' }] })
  const wednesday = summary({
    id: 'wednesday',
    periods: [{ from: '2026-11-04', to: '2026-11-04' }],
  })
  const alerts = [monday, wednesday]
  const settings = { from: '2026-11-02', to: '2026-11-13', windowDays: 3, playbackSpeed: 1 }
  api.setAlerts(filterAlertsForWindow(alerts, timelineWindowAt(settings, 0)))
  assert.deepEqual(
    markers
      .getSource()
      .getFeatures()
      .map((feature) => feature.getId())
      .sort(),
    ['monday', 'wednesday'],
  )
  const nextWindow = timelineWindowAt(settings, 1)
  assert.deepEqual(nextWindow, { from: '2026-11-03', to: '2026-11-05' })
  api.setAlerts(filterAlertsForWindow(alerts, nextWindow))
  assert.deepEqual(
    markers
      .getSource()
      .getFeatures()
      .map((feature) => feature.getId()),
    ['wednesday'],
  )
})
