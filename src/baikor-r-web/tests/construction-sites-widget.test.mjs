import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { workspaceDe, workspaceEn } from '../src/i18n/workspace-messages.ts'

let server
let ConstructionSitesWidget
let model
const i18n = createInstance()

before(async () => {
  await i18n.init({
    lng: 'de',
    fallbackLng: 'de',
    keySeparator: false,
    resources: {
      de: { translation: workspaceDe },
      en: { translation: workspaceEn },
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
  ;({ ConstructionSitesWidget } = await server.ssrLoadModule(
    '/src/features/construction-sites/components/construction-sites-widget.tsx',
  ))
  model = await server.ssrLoadModule(
    '/src/features/construction-sites/components/sites-widget-model.ts',
  )
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

function renderWidget(props = {}) {
  let tree
  function CaptureWidget() {
    tree = ConstructionSitesWidget({
      filters: React.createElement('span', null, 'Site filters'),
      actions: React.createElement('button', null, 'Create site'),
      table: React.createElement('div', null, 'Site list'),
      details: React.createElement('div', null, 'Site details'),
      hasSelection: false,
      onBackToList() {},
      ...props,
    })
    return tree
  }
  const html = renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(CaptureWidget)),
  )
  return { html, controls: descendants(tree) }
}

test('wide panes stay side by side while compact panes follow the record selection', () => {
  assert.equal(model.sitesPaneMode(1100, false), 'split')
  assert.equal(model.sitesPaneMode(1100, true), 'split')
  for (const width of [420, 680, 900, 1099]) {
    assert.equal(model.sitesPaneMode(width, false), 'list')
    assert.equal(model.sitesPaneMode(width, true), 'details')
  }
})

test('divider bounds preserve a readable table and details at every split width', () => {
  for (const [width, usableWidth] of [
    [1100, 1092],
    [1400, 1392],
    [2000, 1992],
  ]) {
    const minimum = model.clampSitesDivider(0, width)
    const maximum = model.clampSitesDivider(100, width)
    assert.ok(Math.abs((minimum / 100) * usableWidth - 560) < 0.001)
    assert.ok(Math.abs(((100 - maximum) / 100) * usableWidth - 400) < 0.001)
    assert.equal(model.clampSitesDivider(56, width), 56)
  }
})

test('resizing clamps an earlier divider preference while malformed stored values use a useful default', () => {
  const widePreference = model.clampSitesDivider(30, 2000)
  assert.equal(widePreference, 30)
  const resized = model.clampSitesDivider(widePreference, 1100)
  assert.ok(Math.abs((resized / 100) * 1092 - 560) < 0.001)
  assert.equal(model.clampSitesDivider(Number.NaN, 1100), 56)
  assert.equal(model.clampSitesDivider(Number.POSITIVE_INFINITY, 1100), 56)
  assert.equal(model.clampSitesDivider(46), 46)
})

test('filters and creation actions are inside the same widget before its list and details', () => {
  const { html, controls } = renderWidget()
  assert.ok(html.includes(`aria-label="${i18n.t('workspace.heading')}"`))
  assert.ok(html.indexOf('Site filters') < html.indexOf('Site list'))
  assert.ok(html.indexOf('Create site') < html.indexOf('Site list'))
  assert.ok(html.includes('Site details'))
  const separator = controls.find((control) => control.props.role === 'separator')
  assert.ok(separator)
  assert.equal(separator.props['aria-orientation'], 'vertical')
  assert.equal(separator.props['aria-valuenow'], 56)
  assert.equal(separator.props['aria-valuemin'], 0)
  assert.equal(separator.props['aria-valuemax'], 100)
})

test('compact details offer the localized back action without discarding the supplied content', async () => {
  await i18n.changeLanguage('en')
  let returned = 0
  const { html, controls } = renderWidget({
    hasSelection: true,
    onBackToList: () => returned++,
  })
  const back = controls.find((control) => control.props.className === 'construction-sites-back')
  assert.ok(back)
  assert.equal(back.props.children, 'Back to list')
  assert.ok(html.includes('Site details'))
  back.props.onClick()
  assert.equal(returned, 1)
})

test('pointer release without an active drag does not release an uncaptured pointer', () => {
  const { controls } = renderWidget()
  const separator = controls.find((control) => control.props.role === 'separator')
  const captured = new Set()
  const currentTarget = {
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture(id) {
      assert.ok(captured.delete(id), 'only captured pointers may be released')
    },
  }
  separator.props.onPointerDown({ button: 2, pointerId: 7, currentTarget })
  separator.props.onPointerUp({ pointerId: 7, currentTarget })
  assert.equal(captured.size, 0)
  separator.props.onPointerDown({ button: 0, pointerId: 8, currentTarget })
  assert.deepEqual([...captured], [8])
  separator.props.onPointerUp({ pointerId: 8, currentTarget })
  assert.equal(captured.size, 0)
})
