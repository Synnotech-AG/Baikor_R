import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server
let RetainedConstructionSiteDetails
const i18n = createInstance()
const translations = {
  de: {
    'record.details': 'Details',
    'record.retainedSiteHint':
      'Die frühere Baustelle wurde gelöscht. Erhaltene Hinweise bleiben lesbar.',
    'record.retainedPeriod': 'Überlappende Zeiträume im Hinweis',
    'constructionSites.sections.areas': 'Flächen',
    'alerts.unbounded': 'Offen',
    'alerts.focus': 'Auf Karte anzeigen',
  },
  en: {
    'record.details': 'Details',
    'record.retainedSiteHint': 'This former site was deleted. Retained evidence remains available.',
    'record.retainedPeriod': 'Overlapping periods retained in this alert',
    'constructionSites.sections.areas': 'Areas',
    'alerts.unbounded': 'Open',
    'alerts.focus': 'Show on map',
  },
}
const alert = {
  id: 'retained-conflict',
  type: 'routeConflict',
  summary: 'Conflict with former construction site',
  description: null,
  condition: 'cleared',
  handling: 'acknowledged',
  occurrence: 1,
  evidenceRevision: 2,
  location: { type: 'Point', coordinates: [320050, 5430050] },
  focusEnvelope: [320000, 5430000, 320100, 5430100],
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-22T10:00:00Z',
  lastEvaluatedAt: '2026-10-22T10:00:00Z',
  version: 3,
  events: [],
  details: {
    routeId: 'retained-route',
    routeTitle: 'Route 42',
    constructionSiteId: 'physically-deleted-site',
    constructionSiteTitle: 'Former bridge repairs',
    distanceMetres: 0,
    sensitivityMetres: 15,
    periods: [
      { from: '2026-10-05', to: '2026-10-09' },
      { from: null, to: '2026-10-15' },
    ],
    areas: [
      {
        id: 'north',
        name: 'Northern work zone',
        location: { type: 'Point', coordinates: [320020, 5430020] },
        focusEnvelope: [320010, 5430010, 320030, 5430030],
      },
      { id: 'legacy', name: 'Legacy area without its own map target' },
    ],
    routeGeometry: null,
    siteGeometries: [],
  },
}

before(async () => {
  await i18n.init({
    lng: 'de',
    fallbackLng: 'de',
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: {
      de: { translation: translations.de },
      en: { translation: translations.en },
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
  ;({ RetainedConstructionSiteDetails } = await server.ssrLoadModule(
    '/src/features/construction-sites/components/retained-construction-site-details.tsx',
  ))
})

after(async () => {
  await server?.close()
})

function descendants(element) {
  if (!React.isValidElement(element)) {
    return []
  }
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)]
}

function renderDetails(props = {}) {
  let tree
  function CaptureDetails() {
    tree = RetainedConstructionSiteDetails({ alert, onFocus() {}, ...props })
    return tree
  }
  const html = renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(CaptureDetails)),
  )
  return { html, controls: descendants(tree) }
}

for (const language of ['de', 'en']) {
  test(`deleted site fallback shows retained evidence and only map actions (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { html } = renderDetails()
    assert.ok(html.includes('<h2 tabindex="-1">Former bridge repairs</h2>'))
    assert.ok(html.includes(translations[language]['record.retainedSiteHint']))
    assert.ok(html.includes(translations[language]['record.retainedPeriod']))
    assert.ok(html.includes('Northern work zone'))
    assert.ok(html.includes('Legacy area without its own map target'))
    assert.ok(html.includes(language === 'de' ? '05.10.2026' : '05/10/2026'))
    assert.ok(html.includes(language === 'de' ? '09.10.2026' : '09/10/2026'))
    assert.ok(html.includes(translations[language]['alerts.unbounded']))
    const names = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(
      ([, attributes, content]) =>
        attributes.match(/\baria-label="([^"]*)"/)?.[1] ?? content.replace(/<[^>]*>/g, ''),
    )
    assert.deepEqual(names, [
      'Northern work zone',
      'Legacy area without its own map target',
      translations[language]['alerts.focus'],
    ])
    assert.equal(/<(?:input|textarea|select)\b/.test(html), false)
    assert.equal(/(?:mailto:|tel:|<a\b)/.test(html), false)
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1]
    assert.ok(footer)
    assert.ok(footer.includes(`aria-label="${translations[language]['alerts.focus']}"`))
  })
}

test('area focus uses retained area coordinates and falls back to the retained alert target', () => {
  const focused = []
  const { controls } = renderDetails({ onFocus: (target) => focused.push(target) })
  controls.find((control) => control.props.children === 'Northern work zone').props.onClick()
  assert.equal(focused.length, 1)
  assert.deepEqual(focused[0].location, {
    type: 'Point',
    coordinates: [320020, 5430020],
  })
  assert.deepEqual(focused[0].focusEnvelope, [320010, 5430010, 320030, 5430030])
  assert.equal(focused[0].details, alert.details)
  controls
    .find((control) => control.props.children === 'Legacy area without its own map target')
    .props.onClick()
  assert.equal(focused[1], alert)
  controls.find((control) => control.props['aria-label'] === i18n.t('alerts.focus')).props.onClick()
  assert.equal(focused[2], alert)
})

test('missing retained geometry disables map actions and missing evidence produces no invented site', () => {
  const focused = []
  const withoutGeometry = {
    ...alert,
    location: null,
    focusEnvelope: null,
    details: {
      ...alert.details,
      areas: [{ id: 'legacy', name: 'Legacy area without its own map target' }],
    },
  }
  const { controls } = renderDetails({
    alert: withoutGeometry,
    onFocus: (target) => focused.push(target),
  })
  const mapActions = controls.filter((control) => control.props.onClick)
  assert.equal(mapActions.length, 2)
  for (const action of mapActions) {
    assert.equal(action.props.disabled, true)
    action.props.onClick()
  }
  assert.deepEqual(focused, [])
  assert.equal(renderDetails({ alert: { ...alert, details: null } }).html, '')
})
