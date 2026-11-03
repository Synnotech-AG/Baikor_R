import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server
let ConstructionSitesTable
let i18n

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ ConstructionSitesTable } = await server.ssrLoadModule(
    '/src/features/construction-sites/components/construction-sites-table.tsx',
  ))
  ;({ default: i18n } = await server.ssrLoadModule('/src/i18n/i18n.ts'))
})

after(async () => {
  await server?.close()
})

const site = {
  id: 'active-site',
  title: 'Northern construction site',
  status: 'planned',
  plannedStart: '2026-11-01',
  plannedEnd: '2026-11-30',
  updatedAt: '2026-11-03T10:00:00Z',
  areaSquareMetres: 123,
  isDeleted: false,
}
const noop = () => {}

function descendants(element) {
  if (!React.isValidElement(element)) {
    return []
  }
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)]
}

function renderTable(props = {}, columnToggles = []) {
  const pendingToggles = [...columnToggles]
  let controls
  function CaptureTable() {
    const tree = ConstructionSitesTable({
      items: [site],
      selectedId: null,
      loading: false,
      selectedIds: [],
      canBulkDelete: true,
      bulkDeleting: false,
      onSelect: noop,
      onSelectionChange: noop,
      onBulkDelete: noop,
      ...props,
    })
    controls = descendants(tree)
    if (pendingToggles.length > 0) {
      // A render-phase update lets SSR exercise the real menu state transition.
      controls
        .find((control) => control.props.menu)
        ?.props.menu.onClick({
          key: pendingToggles.shift(),
        })
    }
    return tree
  }
  const html = renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(CaptureTable)),
  )
  return {
    html,
    controls,
    table: controls.find((control) => control.props.className === 'construction-sites-table').props,
    menu: controls.find((control) => control.props.menu).props.menu,
  }
}

function textContent(html) {
  return html.replace(/<[^>]*>/g, '').trim()
}

function headers(html) {
  const head = html.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] ?? ''
  return [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
    .map((match) => textContent(match[1]))
    .filter(Boolean)
}

for (const language of ['de', 'en']) {
  test(`default table shows title, status and updated date without the optional period (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const canBulkDelete of [false, true]) {
      const { html, table } = renderTable({ canBulkDelete })
      assert.deepEqual(
        table.columns.map((column) => column.dataIndex),
        ['title', 'status', 'updatedAt'],
      )
      assert.deepEqual(headers(html), [
        i18n.t('constructionSites.title'),
        i18n.t('constructionSites.status.label'),
        i18n.t('constructionSites.table.updated'),
      ])
      assert.ok(!html.includes(language === 'de' ? '01.11.2026' : '11/01/2026'))
      assert.ok(table.scroll.x <= 560, 'Default columns must fit a 560 px list pane')
    }
  })

  test(`Columns offers period as an unselected option and preserves the updated default (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { menu } = renderTable()
    assert.deepEqual(menu.selectedKeys, ['updatedAt'])
    assert.equal(
      menu.items.find((item) => item.key === 'plannedStart')?.label,
      language === 'de' ? 'Zeitraum' : 'Period',
    )
    assert.equal(menu.selectedKeys.includes('plannedStart'), false)
  })

  test(`toggling period shows localized dates and toggling it back hides the column (${language})`, async () => {
    await i18n.changeLanguage(language)
    const shown = renderTable({}, ['plannedStart'])
    assert.ok(headers(shown.html).includes(language === 'de' ? 'Zeitraum' : 'Period'))
    assert.ok(shown.html.includes(language === 'de' ? '01.11.2026' : '11/01/2026'))
    assert.ok(shown.html.includes(language === 'de' ? '30.11.2026' : '11/30/2026'))
    assert.ok(shown.menu.selectedKeys.includes('plannedStart'))

    const hidden = renderTable({}, ['plannedStart', 'plannedStart'])
    assert.ok(!headers(hidden.html).includes(language === 'de' ? 'Zeitraum' : 'Period'))
    assert.ok(!hidden.menu.selectedKeys.includes('plannedStart'))
  })
}

test('minimum scroll width follows the visible columns and permission-dependent selection column', () => {
  for (const canBulkDelete of [false, true]) {
    for (const [toggles, optionalWidth] of [
      [[], 120],
      [['updatedAt'], 0],
      [['plannedStart'], 120 + 192],
      [['areaSquareMetres'], 120 + 96],
      [['plannedStart', 'areaSquareMetres'], 120 + 192 + 96],
      [['updatedAt', 'plannedStart'], 192],
    ]) {
      const { table } = renderTable({ canBulkDelete }, toggles)
      assert.equal(table.scroll.x, 240 + 112 + optionalWidth + (canBulkDelete ? 44 : 0))
      assert.equal(Boolean(table.rowSelection), canBulkDelete)
    }
  }
})

test('column preferences preserve archived-row gating and active-only select-all', () => {
  const second = { ...site, id: 'second-active-site' }
  const archived = { ...site, id: 'archived-site', isDeleted: true }
  let selection
  const { table, controls } = renderTable(
    {
      items: [site, second, archived],
      selectedIds: [site.id],
      onSelectionChange: (ids) => {
        selection = ids
      },
    },
    ['plannedStart'],
  )
  assert.equal(table.rowSelection.getCheckboxProps(site).disabled, false)
  assert.equal(table.rowSelection.getCheckboxProps(archived).disabled, true)
  assert.equal(table.rowSelection.preserveSelectedRowKeys, true)
  const selectAll = controls.find(
    (control) =>
      control.props.children === i18n.t('constructionSites.bulkDelete.selectAll', { count: 2 }),
  )
  assert.ok(selectAll)
  selectAll.props.onClick()
  assert.deepEqual(selection, [site.id, second.id])
})
