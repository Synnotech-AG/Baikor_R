import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { routeImportFileError } from '../src/features/routes/route-import-model.ts'
import { routeDe, routeEn } from '../src/features/routes/route-messages.ts'

let server
let RouteImportView
const i18n = createInstance()
const noop = () => {}
const routineImportNotes = [
  'Unreferenced shapes are excluded; paths without trips have no proven service.',
  'Routes without trips are excluded; no daily availability is inferred.',
  "Only supplied route/shape bindings are updated within this feed's service-date coverage; missing bindings are retained.",
  'Suppressed source routes and paths remain suppressed and are not updated or restored.',
]

before(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    keySeparator: false,
    resources: {
      en: { translation: { ...routeEn, 'common.cancel': 'Cancel' } },
      de: { translation: routeDe },
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
  ;({ RouteImportView } = await server.ssrLoadModule('/src/features/routes/route-import.tsx'))
})

after(async () => {
  await server?.close()
})

function render(overrides = {}) {
  const props = {
    enabled: true,
    loading: false,
    file: null,
    result: null,
    error: null,
    onSelectFile: noop,
    onImport: noop,
    onCancel: noop,
    ...overrides,
  }
  return renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(RouteImportView, props)),
  )
}

function buttons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(
    ([, attributes, content]) => ({
      name: content.replace(/<[^>]*>/g, '').trim(),
      disabled: /(?:^|\s)disabled(?:=|\s|$)/.test(attributes),
    }),
  )
}

test('file selection accepts ZIP names and enforces the existing server size limit', () => {
  assert.equal(routeImportFileError({ name: 'delivery.ZIP', size: 25 * 1024 * 1024 }), null)
  assert.equal(
    routeImportFileError({ name: 'delivery.zip', size: 25 * 1024 * 1024 + 1 }),
    'routes.import.file.size',
  )
  assert.equal(routeImportFileError({ name: 'delivery.zip', size: 0 }), 'routes.import.file.size')
  assert.equal(
    routeImportFileError({ name: 'delivery.txt', size: 100 }),
    'routes.import.file.extension',
  )
})

test('initial dialog offers a dropzone and one disabled import action without source or preview inputs', () => {
  const html = render()
  assert.match(html, /ant-upload-drag/)
  assert.doesNotMatch(html, /route-import-source|Check preview|Run reviewed import/)
  const actions = buttons(html)
  assert.equal(actions.find((button) => button.name === 'Import')?.disabled, true)
  assert.equal(actions.find((button) => button.name === 'Cancel')?.disabled, false)
})

test('selected file enables import, while missing permission or pending work disables upload and both actions', () => {
  const file = { name: 'weekly.zip', size: 100 }
  const ready = render({ file })
  assert.match(ready, /weekly.zip/)
  assert.equal(buttons(ready).find((button) => button.name === 'Import')?.disabled, false)
  for (const state of [{ enabled: false }, { loading: true }]) {
    const actions = buttons(render({ file, ...state }))
    assert.equal(actions.find((button) => button.name === 'Import')?.disabled, true)
    assert.equal(
      actions.find((button) => button.name === 'Cancel')?.disabled,
      state.loading === true,
    )
  }
})

test('server failures remain visible with the chosen file ready for retry', () => {
  const html = render({
    file: { name: 'broken.zip', size: 100 },
    error: 'Required shapes.txt is missing.',
  })
  assert.match(html, /ant-alert-error/)
  assert.match(html, /Required shapes.txt is missing\./)
  assert.match(html, /broken.zip/)
  assert.equal(buttons(html).find((button) => button.name === 'Import')?.disabled, false)
})

test('successful import reports route changes and warnings with a close action', () => {
  const html = render({
    result: {
      createdCount: 3,
      updatedCount: 2,
      unchangedCount: 40,
      suppressedCount: 1,
      pathCount: 254,
      warnings: ['One source row was skipped.'],
    },
  })
  assert.match(html, /ant-alert-success/)
  assert.match(html, /254 paths/)
  assert.match(html, /One source row was skipped\./)
  const actions = buttons(html)
  assert.ok(actions.some((button) => button.name === 'Close'))
  assert.equal(
    actions.some((button) => button.name === 'Import'),
    false,
  )
})

test('successful import with only routine policy notes has no warning alert', () => {
  const html = render({
    result: {
      sourceId: 'regional-feed',
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 40,
      suppressedCount: 1,
      createdPathCount: 0,
      updatedPathCount: 0,
      unchangedPathCount: 254,
      suppressedPathCount: 1,
      pathCount: 255,
      routeCount: 41,
      tripCount: 500,
      shapeCount: 260,
      coverageStart: '2026-10-01',
      coverageEnd: '2026-10-31',
      warnings: routineImportNotes,
    },
  })
  assert.match(html, /ant-alert-success/)
  assert.doesNotMatch(html, /ant-alert-warning/)
})

for (const [language, expected] of [
  ['de', 'Neue Verlauf-IDs wurden als zusätzliche Verläufe importiert.'],
  ['en', 'New path IDs were imported as additional paths.'],
]) {
  test(`actionable import warnings remain localized and unknown warnings stay visible (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render({
      result: {
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 40,
        suppressedCount: 0,
        pathCount: 254,
        warnings: [
          ...routineImportNotes,
          'Unmatched shape bindings create separate paths within their source route. Regenerated source shape IDs require explicit provider reconciliation.',
          'Unknown operator warning is retained.',
        ],
      },
    })
    assert.match(html, /ant-alert-warning/)
    assert.ok(html.includes(expected), `Missing warning: ${expected}`)
    assert.match(html, /Unknown operator warning is retained\./)
    assert.equal((html.match(/<li\b/g) ?? []).length, 2)
    await i18n.changeLanguage('en')
  })
}
