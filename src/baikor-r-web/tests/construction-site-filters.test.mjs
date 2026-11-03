import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import dayjs from 'dayjs'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server
let ConstructionSiteFilters
let i18n
const noop = () => {}
before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ ConstructionSiteFilters } = await server.ssrLoadModule(
    '/src/features/construction-sites/components/construction-site-filters.tsx',
  ))
  ;({ default: i18n } = await server.ssrLoadModule('/src/i18n/i18n.ts'))
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
function renderFilters(props = {}) {
  let tree
  function CaptureFilters() {
    tree = ConstructionSiteFilters({
      searchTerm: 'Bridge',
      status: 'planned',
      archive: 'active',
      period: null,
      onSearchChange: noop,
      onStatusChange: noop,
      onPeriodChange: noop,
      ...props,
    })
    return tree
  }
  const html = renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(CaptureFilters)),
  )
  const controls = descendants(tree)
  return {
    html,
    controls,
    popover: controls.find((element) => element.type.name === 'FilterPopover'),
    tags: controls.find((element) => element.type.name === 'FilterTags')?.props.items,
  }
}
for (const language of ['de', 'en']) {
  test(`closed site filters show search and effective tags without inline selectors (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { html, popover, tags } = renderFilters()
    assert.ok(html.includes('value="Bridge"'))
    assert.ok(html.includes(i18n.t('filters.add')))
    assert.ok(!html.includes('role="combobox"'))
    assert.ok(!html.includes('ant-picker'))
    assert.ok(popover)
    assert.deepEqual(
      tags.map((tag) => tag.key),
      ['status', 'archive'],
    )
    assert.ok(tags.every((tag) => html.includes(tag.label)))
    assert.ok(html.includes(i18n.t('filters.remove', { filter: tags[0].label })))
  })
}
test('site filter draft changes publish only on confirmation', () => {
  const changes = []
  const { popover } = renderFilters({
    onStatusChange: (value) => changes.push(['status', value]),
    onArchiveChange: (value) => changes.push(['archive', value]),
    onPeriodChange: (value) => changes.push(['period', value]),
    onIncludeUndatedChange: (value) => changes.push(['undated', value]),
  })
  const patches = []
  const fields = descendants(
    popover.props.children(popover.props.value, (patch) => patches.push(patch)),
  )
  fields
    .find((element) => element.props.id === 'construction-site-status')
    .props.onChange('approved')
  fields.find((element) => element.props.id === 'construction-site-archive').props.onChange('all')
  assert.deepEqual(changes, [])
  assert.deepEqual(patches, [{ status: 'approved' }, { archive: 'all' }])
  popover.props.onApply({ ...popover.props.value, status: 'approved', archive: 'all' })
  assert.deepEqual(changes, [
    ['status', 'approved'],
    ['archive', 'all'],
    ['period', null],
    ['undated', false],
  ])
})
test('removing a filter only changes its own field and search stays immediate', () => {
  const changes = []
  const { controls, tags } = renderFilters({
    archive: 'archived',
    onSearchChange: (value) => changes.push(['search', value]),
    onStatusChange: (value) => changes.push(['status', value]),
    onArchiveChange: (value) => changes.push(['archive', value]),
  })
  tags.find((tag) => tag.key === 'status').onRemove()
  tags.find((tag) => tag.key === 'archive').onRemove()
  controls
    .find((element) => element.props.id === 'construction-site-search')
    .props.onChange({ target: { value: 'Canal' } })
  assert.deepEqual(changes, [
    ['status', 'all'],
    ['archive', 'all'],
    ['search', 'Canal'],
  ])
})
test('one-sided period tags are readable and clear inactive undated state when removed', () => {
  const changes = []
  const { tags } = renderFilters({
    status: 'all',
    archive: 'all',
    period: [dayjs('2026-11-03'), null],
    includeUndated: true,
    onPeriodChange: (value) => changes.push(['period', value]),
    onIncludeUndatedChange: (value) => changes.push(['undated', value]),
  })
  assert.deepEqual(
    tags.map((tag) => tag.key),
    ['period', 'undated'],
  )
  assert.ok(tags[0].label.includes('03.11.2026'))
  tags[0].onRemove()
  assert.deepEqual(changes, [
    ['period', null],
    ['undated', false],
  ])
})
