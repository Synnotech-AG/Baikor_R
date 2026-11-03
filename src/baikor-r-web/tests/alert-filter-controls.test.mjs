import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import dayjs from 'dayjs'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { alertDe, alertEn } from '../src/features/alerts/alert-messages.ts'
import { filterDe, filterEn } from '../src/shared/filters/filter-messages.ts'

let server
let AlertsWidget
let AlertFiltersComponent
let FilterPopover
let FilterTags
const i18n = createInstance()
const noop = () => {}
const filters = {
  search: 'Bridge',
  type: 'routeConflict',
  condition: 'cleared',
  handling: 'handled',
  period: 'past',
  from: '2026-10-01',
  to: '2026-10-31',
}

before(async () => {
  await i18n.init({
    lng: 'de',
    fallbackLng: 'de',
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: {
      de: { translation: { ...alertDe, ...filterDe } },
      en: { translation: { ...alertEn, ...filterEn } },
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
  ;({ AlertsWidget } = await server.ssrLoadModule('/src/features/alerts/alerts-widget.tsx'))
  ;({ AlertFiltersComponent } = await server.ssrLoadModule(
    '/src/features/alerts/alert-filters.tsx',
  ))
  ;({ FilterPopover } = await server.ssrLoadModule('/src/shared/filters/filter-popover.tsx'))
  ;({ FilterTags } = await server.ssrLoadModule('/src/shared/filters/filter-tags.tsx'))
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

function markup(element) {
  return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, element))
}

function capture(component, props) {
  let tree
  function Capture() {
    tree = component(props)
    return tree
  }
  const html = markup(React.createElement(Capture))
  return { html, controls: descendants(tree) }
}

function renderFilters(props = {}) {
  const result = capture(AlertFiltersComponent, { filters, onChange: noop, ...props })
  const popover = result.controls.find((control) => control.type === FilterPopover)
  const tags = result.controls.find((control) => control.type === FilterTags)
  return { ...result, popover, tags: tags.props.items }
}

function renderDraft(popover, draft = filters, update = noop) {
  const tree = popover.props.children(draft, update)
  return { html: markup(tree), controls: descendants(tree) }
}

for (const language of ['de', 'en']) {
  test(`secondary filters stay hidden behind a localized add-filter button (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { html } = renderFilters()
    assert.ok(html.includes('value="Bridge"'))
    assert.ok(html.includes(i18n.t('filters.add')))
    assert.ok(!html.includes('ant-picker-input'))
    assert.ok(!html.includes('ant-select-selector'))
    assert.ok(html.includes(i18n.t('alerts.condition.cleared')))
    assert.ok(html.includes(i18n.t('alerts.handling.handled')))
  })

  test(`calendar draft has named localized inputs and retains dates (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { popover } = renderFilters()
    const { html, controls } = renderDraft(popover)
    assert.ok(html.includes(language === 'en' ? 'value="01/10/2026"' : 'value="01.10.2026"'))
    assert.ok(html.includes(language === 'en' ? 'value="31/10/2026"' : 'value="31.10.2026"'))
    for (const key of ['alerts.from', 'alerts.to']) {
      const label = i18n.t(key)
      assert.notEqual(label, key)
      assert.ok(html.includes(`placeholder="${label}"`))
      const id = html.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`))?.[1]
      assert.ok(id)
      assert.ok(html.includes(`id="${id}"`))
    }
    for (const [className, value] of [
      ['alert-filter-period', 'past'],
      ['alert-filter-condition', 'cleared'],
      ['alert-filter-handling', 'handled'],
    ]) {
      assert.equal(
        controls.find((control) => control.props.className === className)?.props.value,
        value,
      )
    }
  })
}

test('search publishes immediately without publishing any other filter', () => {
  const changes = []
  const { controls } = renderFilters({ onChange: (patch) => changes.push(patch) })
  controls
    .find((control) => control.props['aria-label'] === i18n.t('alerts.search'))
    .props.onChange({
      target: { value: 'Station' },
    })
  assert.deepEqual(changes, [{ search: 'Station' }])
})

test('calendar draft keeps open endpoints and only applies filter fields when requested', () => {
  const changes = []
  const drafts = []
  const { popover } = renderFilters({ onChange: (patch) => changes.push(patch) })
  const { controls } = renderDraft(popover, filters, (patch) => drafts.push(patch))
  const range = controls.find((control) => control.props.allowEmpty)
  assert.deepEqual(range.props.allowEmpty, [true, true])
  range.props.onChange([dayjs('2026-11-02'), dayjs('2026-11-30')])
  range.props.onChange([dayjs('2026-11-02'), null])
  range.props.onChange([null, dayjs('2026-11-30')])
  range.props.onChange(null)
  assert.deepEqual(drafts, [
    { from: '2026-11-02', to: '2026-11-30' },
    { from: '2026-11-02', to: null },
    { from: null, to: '2026-11-30' },
    { from: null, to: null },
  ])
  assert.deepEqual(changes, [])
  popover.props.onApply({ ...filters, from: null, to: '2026-11-30' })
  const { search: _search, ...expected } = filters
  assert.deepEqual(changes, [{ ...expected, from: null, to: '2026-11-30' }])
  assert.equal(filters.from, '2026-10-01')
})

test('all selector edits update only the draft until Apply', () => {
  const changes = []
  const drafts = []
  const { popover } = renderFilters({ onChange: (patch) => changes.push(patch) })
  const { controls } = renderDraft(popover, filters, (patch) => drafts.push(patch))
  for (const [className, value] of [
    ['alert-filter-type', 'all'],
    ['alert-filter-condition', 'present'],
    ['alert-filter-handling', 'open'],
    ['alert-filter-period', 'upcoming'],
  ]) {
    controls.find((control) => control.props.className === className).props.onChange(value)
  }
  assert.deepEqual(changes, [])
  assert.deepEqual(drafts, [
    { type: 'all' },
    { condition: 'present' },
    { handling: 'open' },
    { period: 'upcoming' },
  ])
})

test('Cancel leaves callbacks untouched and Apply preserves a separately changed search', () => {
  const changes = []
  const { popover, controls } = renderFilters({ onChange: (patch) => changes.push(patch) })
  const rendered = capture(FilterPopover, popover.props)
  const popup = rendered.controls.find((control) => control.props.content)
  const cancel = descendants(popup.props.content).find(
    (control) => control.props.children === i18n.t('filters.cancel'),
  )
  assert.ok(cancel)
  cancel.props.onClick()
  assert.deepEqual(changes, [])

  controls
    .find((control) => control.props['aria-label'] === i18n.t('alerts.search'))
    .props.onChange({
      target: { value: 'Changed while filtering' },
    })
  popover.props.onApply({ ...filters, condition: 'present' })
  assert.equal(changes[0].search, 'Changed while filtering')
  assert.ok(!Object.hasOwn(changes[1], 'search'))
  assert.equal(changes[1].condition, 'present')
})

test('default present and open filters have removable tags while inactive filters have none', () => {
  const changes = []
  const defaults = {
    ...filters,
    type: 'all',
    condition: 'present',
    handling: 'open',
    period: 'all',
    from: null,
    to: null,
  }
  const { tags } = renderFilters({ filters: defaults, onChange: (patch) => changes.push(patch) })
  assert.deepEqual(
    tags.map((tag) => tag.key),
    ['condition', 'handling'],
  )
  for (const tag of tags) {
    tag.onRemove()
  }
  assert.deepEqual(changes, [{ condition: 'all' }, { handling: 'all' }])
  assert.deepEqual(
    renderFilters({ filters: { ...defaults, condition: 'all', handling: 'all' } }).tags,
    [],
  )
})

test('removing effective tags clears just their own restriction and preserves search', () => {
  const changes = []
  const { tags } = renderFilters({ onChange: (patch) => changes.push({ ...filters, ...patch }) })
  const resets = {
    type: { type: 'all' },
    condition: { condition: 'all' },
    handling: { handling: 'all' },
    period: { period: 'all' },
    dateRange: { from: null, to: null },
  }
  for (const tag of tags) {
    tag.onRemove()
    assert.deepEqual(changes.at(-1), { ...filters, ...resets[tag.key] })
  }
  assert.equal(changes.length, 5)
  assert.ok(changes.every((value) => value.search === filters.search))
})

test('open date range tags describe the unbounded endpoint', async () => {
  await i18n.changeLanguage('en')
  for (const dateFilters of [
    { from: null, to: '2026-10-31' },
    { from: '2026-10-01', to: null },
  ]) {
    const { tags } = renderFilters({ filters: { ...filters, ...dateFilters } })
    assert.ok(
      tags.find((tag) => tag.key === 'dateRange').label.includes(i18n.t('filters.unbounded')),
    )
  }
})

test('widget uses the shared updateFilter merge and keeps settings as a toolbar icon', () => {
  const changes = []
  const { controls } = capture(AlertsWidget, {
    canEdit: false,
    canAdmin: true,
    antiforgeryReady: true,
    onFocusAlert: noop,
    onOpenConstructionSite: noop,
    onOpenRoute: noop,
    filters,
    onFiltersChange: (next) => changes.push(next),
  })
  const filterComponent = controls.find((control) => control.type === AlertFiltersComponent)
  filterComponent.props.onChange({ condition: 'all' })
  assert.deepEqual(changes, [{ ...filters, condition: 'all' }])
  const settings = controls.find(
    (control) => control.props['aria-label'] === i18n.t('alerts.settings'),
  )
  assert.ok(settings.props.icon)
  assert.equal(settings.props.children, undefined)
})
