import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { routeDe, routeEn } from '../src/features/routes/route-messages.ts'
import { alertDe, alertEn } from '../src/features/alerts/alert-messages.ts'

let server
let RoutesWidget
let AlertsWidget
let AlertDetailsPane
let AlertRuleSettings
let ConstructionSiteMap
let AlertDetectionHealth
let AlertRecheckAction
const i18n = createInstance()
const noop = () => {}

before(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: {
      de: { translation: { ...routeDe, ...alertDe } },
      en: { translation: { ...routeEn, ...alertEn } },
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
  ;({ RoutesWidget } = await server.ssrLoadModule('/src/features/routes/routes-widget.tsx'))
  ;({ AlertsWidget } = await server.ssrLoadModule('/src/features/alerts/alerts-widget.tsx'))
  ;({ AlertDetailsPane } = await server.ssrLoadModule(
    '/src/features/alerts/alert-details-pane.tsx',
  ))
  ;({ AlertRuleSettings } = await server.ssrLoadModule(
    '/src/features/alerts/alert-rule-settings.tsx',
  ))
  ;({ ConstructionSiteMap } = await server.ssrLoadModule(
    '/src/features/construction-sites/components/construction-site-map.tsx',
  ))
  ;({ AlertDetectionHealth, AlertRecheckAction } = await server.ssrLoadModule(
    '/src/features/alerts/alert-detection-controls.tsx',
  ))
})
after(async () => {
  await server?.close()
})

function render(Component, props) {
  return renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(Component, props)),
  )
}
function buttons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(
    ([, attributes, content]) => ({
      name:
        attributes.match(/\baria-label="([^"]*)"/)?.[1] ?? content.replace(/<[^>]*>/g, '').trim(),
      text: content.replace(/<[^>]*>/g, '').trim(),
      disabled: /(?:^|\s)disabled(?:=|\s|$)/.test(attributes),
    }),
  )
}
const baseProps = {
  canEdit: false,
  canAdmin: false,
  antiforgeryReady: true,
  onFocusRoute: noop,
  onDrawRoute: noop,
  onFocusAlert: noop,
  onOpenConstructionSite: noop,
  onOpenRoute: noop,
}
const genericAlert = {
  id: 'generic',
  createdAt: '2026-10-01T10:00:00Z',
  type: 'futureType',
  summary: 'Independent generic alert',
  description: null,
  condition: 'present',
  handling: 'open',
  occurrence: 1,
  evidenceRevision: 7,
  version: 3,
  location: null,
  lastEvaluatedAt: null,
  details: null,
  events: [],
}

test('healthy automatic detection is quiet, including completed full scans', async () => {
  await i18n.changeLanguage('en')
  const status = {
    pendingCount: 0,
    failedCount: 0,
    lastEvaluatedAt: '2026-10-29T10:00:00Z',
    latestScan: { state: 'completed', totalCount: 41, completedCount: 41, failedCount: 0 },
  }
  assert.equal(render(AlertDetectionHealth, { status }), '')
  const widget = render(AlertsWidget, { ...baseProps, canAdmin: true })
  assert.equal(
    buttons(widget).some((button) => button.name === i18n.t('alerts.recheck')),
    false,
  )
})

test('unknown, pending, failed, paused, unavailable and incomplete detection remain visible', async () => {
  await i18n.changeLanguage('en')
  const current = { pendingCount: 0, failedCount: 0, lastEvaluatedAt: genericAlert.createdAt }
  for (const [status, unavailable, key, values] of [
    [null, false, 'alerts.status.unknown', {}],
    [{ ...current, pendingCount: 3 }, false, 'alerts.status.pending', { count: 3 }],
    [{ ...current, failedCount: 2 }, false, 'alerts.status.failed', { count: 2 }],
    [
      { ...current, pausedTypes: ['routeConflict'] },
      false,
      'alerts.status.paused',
      { types: i18n.t('alerts.routeConflict') },
    ],
    [current, true, 'alerts.status.unavailable', {}],
    [
      { ...current, unassessableSiteCount: 2 },
      false,
      'alerts.status.incompleteCoverage',
      { count: 2 },
    ],
  ]) {
    const html = render(AlertDetectionHealth, { status, unavailable })
    assert.ok(html.includes(i18n.t(key, values)), key)
  }
})

test('administrative recheck remains permission and session gated outside the normal toolbar', async () => {
  await i18n.changeLanguage('en')
  const props = { canAdmin: true, ready: true, pending: false, loading: false, onStart: noop }
  assert.equal(render(AlertRecheckAction, { ...props, canAdmin: false }), '')
  assert.equal(buttons(render(AlertRecheckAction, props))[0]?.disabled, false)
  for (const state of [{ ready: false }, { pending: true }, { loading: true }]) {
    assert.equal(buttons(render(AlertRecheckAction, { ...props, ...state }))[0]?.disabled, true)
  }
})

test('historical conflict subjects stay readable without opening current records', async () => {
  await i18n.changeLanguage('en')
  const html = render(AlertDetailsPane, {
    alert: {
      ...genericAlert,
      type: 'routeConflict',
      details: {
        routeId: 'route',
        routeTitle: 'Old Route',
        constructionSiteId: 'site',
        constructionSiteTitle: 'Old Site',
        distanceMetres: 1,
        sensitivityMetres: 10,
        periods: [],
        areas: [],
        siteGeometries: [],
        routeGeometry: null,
      },
    },
    historical: true,
    canReview: true,
    saving: false,
    onFocus: noop,
    onOpenConstructionSite: noop,
    onOpenRoute: noop,
  })
  assert.ok(html.includes('Old Route'))
  assert.ok(html.includes('Old Site'))
  assert.equal(
    buttons(html).some((button) =>
      ['Old Route', 'Old Site', i18n.t('alerts.review')].includes(button.name),
    ),
    false,
  )
})

test('map focus preserves whether the detail pane shows current or historical evidence', () => {
  function descendants(element) {
    if (!React.isValidElement(element)) {
      return []
    }
    return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)]
  }
  for (const historical of [false, true]) {
    const calls = []
    let tree
    const alert = { ...genericAlert, location: { type: 'Point', coordinates: [320000, 5430000] } }
    function CaptureDetails() {
      tree = AlertDetailsPane({
        ...baseProps,
        alert,
        canReview: false,
        saving: false,
        historical,
        onFocus: (target, origin) => calls.push({ target, origin }),
      })
      return tree
    }
    render(CaptureDetails)
    const focus = descendants(tree).find(
      (element) => element.props['aria-label'] === i18n.t('alerts.focus'),
    )
    focus.props.onClick()
    assert.deepEqual(calls, [{ target: alert, origin: historical ? 'historical' : 'current' }])
  }
})

test('grouped path cards show each own calendar and selectively disable hidden paths', async () => {
  await i18n.changeLanguage('en')
  const { RoutePathCards } = await server.ssrLoadModule('/src/features/routes/route-path-cards.tsx')
  const version = {
    id: 'v',
    validFrom: '2026-10-01',
    validTo: '2026-10-31',
    hasOperatingCalendar: true,
    sourceCoverageStart: '2026-10-01',
    sourceCoverageEnd: '2026-10-31',
    periods: [{ from: '2026-10-05', to: '2026-10-09' }],
  }
  const html = render(RoutePathCards, {
    route: {
      id: 'parent',
      isSuppressed: false,
      paths: [
        { id: 'west', title: 'Central – West', versions: [version], isSuppressed: false },
        {
          id: 'east',
          title: 'Central – East',
          versions: [{ ...version, id: 'v2', periods: [] }],
          isSuppressed: true,
        },
      ],
    },
    selectedPathId: 'west',
    onSelect: noop,
    includeDeleted: true,
  })
  assert.ok(html.includes('Central – West'))
  assert.ok(html.includes('Central – East'))
  assert.ok(html.includes(i18n.t('routes.noOperation')))
  assert.ok(html.includes('05/10/2026'))
  assert.ok(html.includes('09/10/2026'))
  assert.equal(html.includes('01/10/2026'), false)
  assert.equal(html.includes('31/10/2026'), false)
  const actions = buttons(html)
  assert.equal(
    actions.find(
      (button) => button.name === i18n.t('routes.focusPath', { title: 'Central – West' }),
    )?.disabled,
    false,
  )
  assert.equal(
    actions.find(
      (button) => button.name === i18n.t('routes.focusPath', { title: 'Central – East' }),
    )?.disabled,
    true,
  )
})

test('path cards hide deleted children by default and count only visible paths', async () => {
  await i18n.changeLanguage('en')
  const { RoutePathCards } = await server.ssrLoadModule('/src/features/routes/route-path-cards.tsx')
  const props = {
    route: {
      id: 'parent',
      isSuppressed: false,
      paths: [
        { id: 'west', title: 'Active West', versions: [], isSuppressed: false },
        { id: 'east', title: 'Deleted East', versions: [], isSuppressed: true },
      ],
    },
    selectedPathId: null,
    onSelect: noop,
    canRestore: true,
    onRestore: noop,
  }
  const active = render(RoutePathCards, props)
  assert.ok(active.includes('Active West'))
  assert.equal(active.includes('Deleted East'), false)
  assert.ok(active.includes(i18n.t('routes.pathCount', { count: 1 })))
  assert.equal(
    buttons(active).some((button) => button.name === i18n.t('routes.restorePath')),
    false,
  )

  const all = render(RoutePathCards, { ...props, includeDeleted: true })
  assert.ok(all.includes('Deleted East'))
  assert.ok(all.includes(i18n.t('routes.pathCount', { count: 2 })))
  assert.equal(
    buttons(all).find((button) => button.name === i18n.t('routes.restorePath'))?.disabled,
    false,
  )
})

for (const language of ['de', 'en']) {
  test(`path deletion is named and limited to editable active paths (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { RoutePathCards } = await server.ssrLoadModule(
      '/src/features/routes/route-path-cards.tsx',
    )
    const props = {
      route: {
        id: 'parent',
        isSuppressed: false,
        paths: [
          { id: 'west', title: 'West', versions: [], isSuppressed: false },
          { id: 'east', title: 'East', versions: [], isSuppressed: true },
        ],
      },
      selectedPathId: null,
      onSelect: noop,
      canDelete: true,
      onDelete: noop,
      includeDeleted: true,
    }
    const name = i18n.t('routes.deletePathNamed', { title: 'West' })
    assert.notEqual(name, 'routes.deletePathNamed')
    const action = buttons(render(RoutePathCards, props)).find((button) => button.name === name)
    assert.ok(action)
    assert.equal(action.disabled, false)
    assert.equal(action.text, '')
    assert.equal(
      buttons(render(RoutePathCards, props)).some(
        (button) => button.name === i18n.t('routes.deletePathNamed', { title: 'East' }),
      ),
      false,
    )

    for (const state of [
      { canDelete: false },
      { canDelete: undefined },
      { onDelete: undefined },
      { route: { ...props.route, isSuppressed: true } },
    ]) {
      assert.equal(
        buttons(render(RoutePathCards, { ...props, ...state })).some(
          (button) => button.name === name,
        ),
        false,
      )
    }
    for (const state of [{ deleting: true }, { restoring: true }]) {
      assert.equal(
        buttons(render(RoutePathCards, { ...props, ...state })).find(
          (button) => button.name === name,
        )?.disabled,
        true,
      )
    }
  })
}

test('path deletion invokes its callback only through confirmation with the selected child ID', async () => {
  await i18n.changeLanguage('en')
  const { RoutePathCards } = await server.ssrLoadModule('/src/features/routes/route-path-cards.tsx')
  const deleted = []
  let tree
  function CapturePathCards() {
    tree = RoutePathCards({
      route: {
        id: 'parent',
        isSuppressed: false,
        paths: [{ id: 'west', title: 'West', versions: [], isSuppressed: false }],
      },
      selectedPathId: null,
      onSelect: noop,
      canDelete: true,
      onDelete: (id) => deleted.push(id),
    })
    return tree
  }
  render(CapturePathCards)
  assert.deepEqual(deleted, [])
  function descendants(element) {
    if (!React.isValidElement(element)) {
      return []
    }
    return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)]
  }
  const elements = descendants(tree)
  const trigger = elements.find(
    (element) =>
      element.props['aria-label'] === i18n.t('routes.deletePathNamed', { title: 'West' }),
  )
  assert.ok(trigger)
  assert.equal(trigger.props.onClick, undefined)
  const confirmation = elements.find(
    (element) => element.props.title === i18n.t('routes.deletePathTitle'),
  )
  assert.ok(confirmation)
  assert.equal(confirmation.props.description, i18n.t('routes.deletePathHint'))
  assert.equal(confirmation.props.okText, i18n.t('routes.deletePath'))
  assert.equal(confirmation.props.cancelText, i18n.t('common.cancel'))
  confirmation.props.onConfirm()
  assert.deepEqual(deleted, ['west'])
})

test('route footer offers only edit, restore and secondary actions without duplicate map or copy actions', async () => {
  await i18n.changeLanguage('en')
  const { RouteActions } = await server.ssrLoadModule('/src/features/routes/route-actions.tsx')
  const props = {
    route: { sourceId: 'provider', isSuppressed: false },
    canEdit: true,
    ready: true,
    restoring: false,
    deactivating: false,
    onEdit: noop,
    onRestore: noop,
    onDeactivate: noop,
  }
  const imported = buttons(render(RouteActions, props))
  assert.deepEqual(
    imported.map((button) => button.name),
    [i18n.t('routes.moreActions')],
  )
  const manual = buttons(
    render(RouteActions, { ...props, route: { ...props.route, sourceId: null } }),
  )
  assert.deepEqual(
    manual.map((button) => button.name),
    [i18n.t('routes.edit'), i18n.t('routes.moreActions')],
  )
  const viewerHtml = render(RouteActions, { ...props, canEdit: false })
  const viewer = buttons(viewerHtml)
  assert.deepEqual(
    viewer.map((button) => button.name),
    [],
  )
  assert.equal(viewerHtml.includes('route-footer'), false)
  const inactive = buttons(
    render(RouteActions, { ...props, route: { ...props.route, isSuppressed: true } }),
  )
  assert.deepEqual(
    inactive.map((button) => button.name),
    [i18n.t('routes.restore')],
  )
  assert.equal(inactive[0].disabled, false)
  const pending = buttons(render(RouteActions, { ...props, ready: false }))
  assert.equal(
    pending.find((button) => button.name === i18n.t('routes.moreActions'))?.disabled,
    true,
  )
})

test('manual editor exposes separately named paths and removes only with more than one path', async () => {
  await i18n.changeLanguage('en')
  const { RouteForm } = await server.ssrLoadModule('/src/features/routes/route-form.tsx')
  const form = {
    title: 'Parent',
    description: '',
    paths: [{ key: 'west', title: 'West', validFrom: '', validTo: '', geometry: null }],
  }
  const html = render(RouteForm, {
    form,
    enabled: true,
    onChange: noop,
    onDraw: noop,
    onUpload: noop,
    onSelectPath: noop,
    selectedPathKey: 'west',
    onAddPath: noop,
    onRemovePath: noop,
  })
  assert.ok(html.includes('West'))
  assert.equal(
    buttons(html).find((button) => button.name === i18n.t('routes.addPath'))?.disabled,
    false,
  )
  assert.equal(
    buttons(html).find((button) => button.name === i18n.t('routes.removePath'))?.disabled,
    true,
  )
})

test('manual editor exposes only the selected path fields while keeping every path selectable', async () => {
  await i18n.changeLanguage('en')
  const { RouteForm } = await server.ssrLoadModule('/src/features/routes/route-form.tsx')
  const form = {
    title: 'Parent',
    description: '',
    paths: [
      { key: 'west', title: 'West', validFrom: '', validTo: '', geometry: null },
      { key: 'east', title: 'East', validFrom: '2026-11-01', validTo: '', geometry: null },
    ],
  }
  const props = {
    form,
    enabled: true,
    onChange: noop,
    onDraw: noop,
    onUpload: noop,
    onSelectPath: noop,
    selectedPathKey: 'east',
    onAddPath: noop,
    onRemovePath: noop,
  }
  const html = render(RouteForm, props)
  assert.ok(html.includes('West'))
  assert.ok(html.includes('East'))
  assert.ok(html.includes('id="route-path-title-east"'))
  assert.equal(html.includes('id="route-path-title-west"'), false)
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  assert.equal(
    buttons(html).find((button) => button.name === i18n.t('routes.removePath'))?.disabled,
    false,
  )

  const locked = buttons(render(RouteForm, { ...props, enabled: false }))
  assert.ok(locked.length > 0)
  assert.ok(locked.every((button) => button.disabled))
})

test('hidden child path offers explicit restore only on an active parent for a ready editor', async () => {
  await i18n.changeLanguage('en')
  const { RoutePathCards } = await server.ssrLoadModule('/src/features/routes/route-path-cards.tsx')
  const props = {
    route: {
      id: 'parent',
      isSuppressed: false,
      paths: [{ id: 'hidden', title: 'Old', isSuppressed: true, versions: [] }],
    },
    selectedPathId: null,
    onSelect: noop,
    canRestore: true,
    onRestore: noop,
    includeDeleted: true,
  }
  assert.equal(
    buttons(render(RoutePathCards, props)).find(
      (button) => button.name === i18n.t('routes.restorePath'),
    )?.disabled,
    false,
  )
  assert.equal(
    buttons(render(RoutePathCards, { ...props, canRestore: false })).some(
      (button) => button.name === i18n.t('routes.restorePath'),
    ),
    false,
  )
  for (const state of [{ restoring: true }, { deleting: true }]) {
    assert.equal(
      buttons(render(RoutePathCards, { ...props, ...state })).find(
        (button) => button.name === i18n.t('routes.restorePath'),
      )?.disabled,
      true,
    )
  }
  assert.equal(
    buttons(
      render(RoutePathCards, { ...props, route: { ...props.route, isSuppressed: true } }),
    ).some((button) => button.name === i18n.t('routes.restorePath')),
    false,
  )
})

test('retained case view exposes journal evidence and suppresses review even when editable', async () => {
  await i18n.changeLanguage('en')
  const html = render(AlertDetailsPane, {
    alert: {
      ...genericAlert,
      evidenceRevisions: [1],
      events: [
        {
          id: 'retained',
          kind: 'handlingChanged',
          createdAt: genericAlert.createdAt,
          actor: 'Reviewer',
          note: 'Retained decision',
          evidenceRevision: 1,
        },
      ],
    },
    readOnly: true,
    canReview: true,
    saving: false,
    onFocus: noop,
    onOpenConstructionSite: noop,
    onOpenRoute: noop,
    onViewEvidence: noop,
  })
  assert.ok(html.includes('Retained decision'))
  assert.equal(
    buttons(html).some((button) => button.name === i18n.t('alerts.review')),
    false,
  )
  assert.equal(
    buttons(html).find((button) => button.name === i18n.t('alerts.viewEvidence'))?.disabled,
    false,
  )
})

test('affected path cards retain calendar gaps with concise availability and named map controls', async () => {
  await i18n.changeLanguage('en')
  const { AlertPathEvidence } = await server.ssrLoadModule(
    '/src/features/alerts/alert-path-evidence.tsx',
  )
  const path = {
    pathId: 'west',
    pathTitle: 'West',
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
    },
    validFrom: null,
    validTo: null,
    sourceCoverageStart: '2026-10-01',
    sourceCoverageEnd: '2026-10-31',
    hasOperatingCalendar: true,
    periods: [
      { from: '2026-10-05', to: '2026-10-09' },
      { from: '2026-10-12', to: '2026-10-13' },
    ],
  }
  const html = render(AlertPathEvidence, {
    alert: {
      ...genericAlert,
      details: { paths: [path, { ...path, pathId: 'east', pathTitle: 'East', periods: [] }] },
    },
    onFocus: noop,
  })
  assert.ok(html.includes(i18n.t('alerts.noOperation')))
  assert.ok(html.includes('05/10/2026 – 09/10/2026 · 12/10/2026 – 13/10/2026'))
  assert.ok(!html.includes('05/10/2026 – 13/10/2026'))
  assert.ok(!html.includes(i18n.t('alerts.unbounded')))
  assert.ok(!html.includes('01/10/2026'))
  assert.ok(!html.includes('31/10/2026'))
  assert.equal((html.match(/alert-path-availability/g) ?? []).length, 2)
  assert.equal((html.match(/<h4>/g) ?? []).length, 1)
  assert.equal(
    buttons(html).find((button) => button.name === i18n.t('alerts.focusPath', { title: 'West' }))
      ?.disabled,
    false,
  )
  assert.equal(
    buttons(html).find((button) => button.name === i18n.t('alerts.focusPath', { title: 'East' }))
      ?.disabled,
    false,
  )
})

test('superseded case retains its journal and canonical link while disallowing review', async () => {
  await i18n.changeLanguage('en')
  const html = render(AlertDetailsPane, {
    alert: {
      ...genericAlert,
      supersededByAlertId: 'canonical',
      events: [
        {
          id: 'retained',
          kind: 'handlingChanged',
          createdAt: genericAlert.createdAt,
          actor: 'Reviewer',
          note: 'Retained decision',
          evidenceRevision: 1,
        },
      ],
      relatedAlerts: [],
    },
    canReview: true,
    saving: false,
    onFocus: noop,
    onOpenConstructionSite: noop,
    onOpenRoute: noop,
    onOpenRelatedAlert: noop,
  })
  assert.ok(html.includes('Retained decision'))
  assert.ok(html.includes(i18n.t('alerts.supersededHint')))
  assert.equal(
    buttons(html).some((button) => button.name === i18n.t('alerts.review')),
    false,
  )
  assert.equal(
    buttons(html).find((button) => button.name === i18n.t('alerts.openCanonical'))?.disabled,
    false,
  )
})

for (const language of ['de', 'en']) {
  test(`route conflicts omit explanatory prose in the detail pane (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(AlertDetailsPane, {
      alert: {
        ...genericAlert,
        type: 'routeConflict',
        description: 'Server-generated English description',
        details: {
          routeId: 'route',
          routeTitle: 'Route',
          constructionSiteId: 'site',
          constructionSiteTitle: 'Site',
          distanceMetres: 1,
          sensitivityMetres: 10,
          periods: [{ from: '2026-10-05', to: '2026-10-09' }],
          areas: [],
          routeGeometry: null,
          siteGeometries: [],
        },
      },
      canReview: true,
      saving: false,
      onFocus: noop,
      onOpenConstructionSite: noop,
      onOpenRoute: noop,
    })
    assert.ok(!html.includes('alert-description'))
    assert.ok(!html.split('<details class="alert-history">')[0].includes('alert-hint'))
    assert.match(html, /<details class="alert-history"><summary>/)
    assert.doesNotMatch(html, /<details[^>]*class="alert-history"[^>]*open/)
    assert.ok(!html.includes('ant-alert'))
    assert.ok(!html.includes('Server-generated English description'))
    assert.ok(html.includes(i18n.t('alerts.periods')))
    for (const key of [
      'alerts.distance',
      'alerts.threshold',
      'alerts.occurrence',
      'alerts.revision',
      'alerts.evaluated',
    ]) {
      assert.ok(!html.includes(i18n.t(key)), `${key} must not clutter current conflict details`)
    }
    const subjects = html.match(/<dl class="alert-subjects">([\s\S]*?)<\/dl>/)?.[1]
    assert.ok(subjects, 'Subjects should be grouped at the top')
    assert.ok(subjects.includes(`<dt>${i18n.t('alerts.site')}</dt>`))
    assert.ok(subjects.includes(`<dt>${i18n.t('alerts.route')}</dt>`))
    assert.ok(buttons(subjects).some((button) => button.name === 'Site'))
    assert.ok(buttons(subjects).some((button) => button.name === 'Route'))
    assert.ok(html.indexOf('alert-subjects') < html.indexOf(i18n.t('alerts.periods')))
    assert.equal(
      buttons(html).find((button) => button.name === i18n.t('alerts.review'))?.disabled,
      false,
    )
    const routes = render(RoutesWidget, baseProps)
    assert.ok(!routes.includes(language === 'de' ? '>Quelle<' : '>Source<'))
    assert.ok(!routes.includes(language === 'de' ? '>Importiert<' : '>Imported<'))
  })

  test(`historical evidence has no review or current subject actions even for an editor (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(AlertDetailsPane, {
      alert: genericAlert,
      historical: true,
      canReview: true,
      saving: false,
      onReview: noop,
      onFocus: noop,
      onOpenConstructionSite: noop,
      onOpenRoute: noop,
    })
    assert.ok(html.includes(i18n.t('alerts.historicalEvidence')))
    assert.ok(html.includes(i18n.t('alerts.historicalHint')))
    assert.equal(
      buttons(html).some((button) => button.name === i18n.t('alerts.review')),
      false,
    )
    assert.ok(!html.includes(i18n.t('alerts.historyEmpty')))
  })

  test(`event journal offers concrete evidence revisions only (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(AlertDetailsPane, {
      alert: {
        ...genericAlert,
        evidenceRevisions: [1],
        events: [1, 0, 99].map((revision) => ({
          id: String(revision),
          kind: 'detected',
          createdAt: '2026-10-01T12:34:56',
          actor: 'system',
          evidenceRevision: revision,
        })),
      },
      canReview: false,
      saving: false,
      onReview: noop,
      onFocus: noop,
      onOpenConstructionSite: noop,
      onOpenRoute: noop,
      onViewEvidence: noop,
    })
    const timestamps = [...html.matchAll(/<small>([^<]*)<\/small>/g)].map(([, value]) => value)
    assert.deepEqual(
      timestamps,
      Array(3).fill(language === 'de' ? '01.10.2026, 12:34:56' : '01/10/2026, 12:34:56'),
    )
    assert.equal(
      buttons(html).filter((button) => button.name === i18n.t('alerts.viewEvidence')).length,
      1,
    )
  })

  test(`stale evidence is visibly explained in the detail pane and cannot be submitted before refresh (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(AlertDetailsPane, {
      alert: genericAlert,
      stale: true,
      onRefresh: noop,
      canReview: true,
      saving: false,
      onReview: noop,
      onFocus: noop,
      onOpenConstructionSite: noop,
      onOpenRoute: noop,
    })
    assert.ok(html.includes(i18n.t('alerts.detailsStale')))
    const actions = buttons(html)
    assert.equal(
      actions.find((button) => button.name === i18n.t('alerts.refresh'))?.disabled,
      false,
    )
    assert.equal(actions.find((button) => button.name === i18n.t('alerts.review'))?.disabled, true)
  })

  test(`current and historical conflict details omit affected areas while retaining periods (${language})`, async () => {
    await i18n.changeLanguage(language)
    const alert = {
      ...genericAlert,
      type: 'routeConflict',
      details: {
        routeId: 'route',
        routeTitle: 'Route',
        constructionSiteId: 'site',
        constructionSiteTitle: 'Site',
        distanceMetres: 1,
        sensitivityMetres: 10,
        periods: [{ from: '2026-10-05', to: '2026-10-09' }],
        areas: [
          {
            id: 'area-1',
            name: 'West',
            location: { type: 'Point', coordinates: [320000, 5430000] },
            focusEnvelope: [319990, 5429990, 320010, 5430010],
          },
          {
            id: 'area-2',
            name: 'East',
            location: { type: 'Point', coordinates: [321000, 5430000] },
            focusEnvelope: [320990, 5429990, 321010, 5430010],
          },
        ],
        routeGeometry: null,
        siteGeometries: [],
      },
    }
    for (const historical of [false, true]) {
      const html = render(AlertDetailsPane, {
        alert,
        historical,
        canReview: false,
        saving: false,
        onFocus: noop,
        onOpenConstructionSite: noop,
        onOpenRoute: noop,
      })
      assert.equal(html.includes(i18n.t('alerts.areas')), false)
      assert.equal(html.includes('West'), false)
      assert.equal(html.includes('East'), false)
      assert.ok(html.includes(i18n.t('alerts.periods')))
      assert.ok(html.includes(language === 'de' ? '05.10.2026' : '05/10/2026'))
    }
    assert.equal(alert.details.areas.length, 2)
  })

  test(`alert footer has a concise save action and a named icon-only map control (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const location of [null, { type: 'Point', coordinates: [320000, 5430000] }]) {
      const html = render(AlertDetailsPane, {
        alert: { ...genericAlert, location },
        canReview: true,
        saving: false,
        onReview: noop,
        onFocus: noop,
        onOpenConstructionSite: noop,
        onOpenRoute: noop,
      })
      const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1]
      assert.ok(footer)
      const actions = buttons(footer)
      assert.equal(actions[0]?.name, language === 'de' ? 'Speichern' : 'Save')
      assert.equal(actions[0]?.disabled, false)
      assert.equal(actions[1]?.name, i18n.t('alerts.focus'))
      assert.equal(actions[1]?.text, '')
      assert.equal(actions[1]?.disabled, location === null)
    }
  })

  test(`alert toolbar omits refresh while retaining administrator settings (${language})`, async () => {
    await i18n.changeLanguage(language)
    const actions = buttons(render(AlertsWidget, { ...baseProps, canAdmin: true }))
    assert.equal(
      actions.some((button) => button.name === i18n.t('alerts.refresh')),
      false,
    )
    assert.equal(
      actions.find((button) => button.name === i18n.t('alerts.settings'))?.disabled,
      false,
    )
  })

  test(`conflict settings show editable controls without a rule explanation banner (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(AlertRuleSettings, {
      rule: { enabled: true, sensitivityMetres: 10, eligibleStatuses: ['approved'] },
      enabled: true,
      saving: false,
      onChange: noop,
      onSave: noop,
    })
    assert.equal(html.includes(i18n.t('alerts.ruleHint')), false)
    assert.ok(html.includes(i18n.t('alerts.enabled')))
    assert.ok(html.includes(i18n.t('alerts.sensitivity')))
    assert.ok(html.includes('id="alert-rule-distance"'))
  })

  test(`viewer widgets hide write and admin actions while showing evaluation uncertainty (${language})`, async () => {
    await i18n.changeLanguage(language)
    const routeButtons = buttons(render(RoutesWidget, baseProps))
    assert.equal(
      routeButtons.some(
        (button) => button.name === i18n.t('routes.new') || button.name === i18n.t('routes.import'),
      ),
      false,
    )
    const alerts = render(AlertsWidget, baseProps)
    const alertButtons = buttons(alerts)
    assert.equal(
      alertButtons.some(
        (button) =>
          button.name === i18n.t('alerts.settings') || button.name === i18n.t('alerts.recheck'),
      ),
      false,
    )
    assert.ok(alerts.includes(i18n.t('alerts.status.unknown')))
  })

  test(`route map authoring has line-specific finish/cancel controls and no polygon edit action (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(ConstructionSiteMap, {
      mapElementRef: { current: null },
      drawing: false,
      editingGeometry: false,
      canEditGeometry: true,
      onStartEditing: noop,
      onSelectAddress: noop,
      onCancelDrawing: noop,
      onFinishDrawing: noop,
      routeDrawing: true,
      canFinishRouteDrawing: false,
      onFinishRouteDrawing: noop,
      onCancelRouteDrawing: noop,
    })
    const actions = buttons(html)
    assert.equal(
      actions.find((button) => button.name === i18n.t('routes.finishDrawing'))?.disabled,
      true,
    )
    assert.equal(
      actions.find((button) => button.name === i18n.t('routes.cancelDrawing'))?.disabled,
      false,
    )
    assert.equal(
      actions.some((button) => button.name === 'geometry.edit'),
      false,
    )
  })

  test(`generic nonspatial alert renders without route/site assumptions or review permission (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(AlertDetailsPane, {
      alert: genericAlert,
      canReview: false,
      saving: false,
      onReview: noop,
      onFocus: noop,
      onOpenConstructionSite: noop,
      onOpenRoute: noop,
    })
    assert.ok(html.includes(genericAlert.summary))
    const actions = buttons(html)
    assert.equal(actions.find((button) => button.name === i18n.t('alerts.focus'))?.disabled, true)
    assert.equal(
      actions.some(
        (button) =>
          button.name === i18n.t('alerts.review') ||
          button.name === i18n.t('alerts.site') ||
          button.name === i18n.t('alerts.route'),
      ),
      false,
    )
  })
}

test('session readiness gates route writes and alert administrator controls', async () => {
  await i18n.changeLanguage('en')
  const props = { ...baseProps, canEdit: true, canAdmin: true, antiforgeryReady: false }
  const routeButtons = buttons(render(RoutesWidget, props))
  assert.equal(routeButtons.find((button) => button.name === i18n.t('routes.new'))?.disabled, true)
  assert.equal(
    routeButtons.find((button) => button.name === i18n.t('routes.createOptions'))?.disabled,
    true,
  )
  const alertButtons = buttons(render(AlertsWidget, props))
  assert.equal(
    alertButtons.find((button) => button.name === i18n.t('alerts.settings'))?.disabled,
    true,
  )
  assert.equal(
    alertButtons.some((button) => button.name === i18n.t('alerts.recheck')),
    false,
  )
})

test('route and alert messages have matching nonempty German and English keys', () => {
  for (const [de, en] of [
    [routeDe, routeEn],
    [alertDe, alertEn],
  ]) {
    assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort())
    for (const dictionary of [de, en]) {
      for (const value of Object.values(dictionary)) {
        assert.equal(typeof value, 'string')
        assert.ok(value.trim())
      }
    }
  }
})
