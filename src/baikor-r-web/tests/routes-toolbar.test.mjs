import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server
let RouteCreateButton
const labels = { create: 'New route', import: 'Import GTFS', options: 'Route creation options' }

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ RouteCreateButton } = await server.ssrLoadModule(
    '/src/features/routes/route-create-button.tsx',
  ))
})
after(async () => {
  await server?.close()
})

function props(overrides = {}) {
  return { canEdit: true, ready: true, labels, onCreate() {}, onImport() {}, ...overrides }
}

test('creation actions are not offered to readers', () => {
  const html = renderToStaticMarkup(
    React.createElement(RouteCreateButton, props({ canEdit: false })),
  )
  assert.equal(html, '')
})

test('create is the main action and GTFS is the only dropdown choice', () => {
  const calls = []
  const tree = RouteCreateButton(
    props({ onCreate: () => calls.push('create'), onImport: () => calls.push('import') }),
  )
  const [createButton, dropdown] = React.Children.toArray(tree.props.children)
  assert.equal(createButton.props.children, labels.create)
  assert.equal(dropdown.props.menu.items.length, 1)
  assert.equal(dropdown.props.menu.items[0].label, labels.import)
  createButton.props.onClick()
  assert.deepEqual(calls, ['create'])
  dropdown.props.menu.items[0].onClick()
  assert.deepEqual(calls, ['create', 'import'])

  const html = renderToStaticMarkup(React.createElement(RouteCreateButton, props()))
  assert.equal((html.match(/<button\b/g) ?? []).length, 2)
  assert.ok(html.includes(labels.create))
  assert.ok(html.includes(`aria-label="${labels.options}"`))
  assert.ok(html.includes('aria-haspopup="menu"'))
  assert.equal(html.includes(labels.import), false)
})

test('pending requests or CSRF initialization disable both actions and menu callback', () => {
  const calls = []
  const tree = RouteCreateButton(
    props({
      ready: false,
      onCreate: () => calls.push('create'),
      onImport: () => calls.push('import'),
    }),
  )
  const [createButton, dropdown] = React.Children.toArray(tree.props.children)
  assert.equal(createButton.props.disabled, true)
  assert.equal(dropdown.props.disabled, true)
  assert.equal(dropdown.props.children.props.disabled, true)
  assert.equal(dropdown.props.menu.items[0].disabled, true)
  createButton.props.onClick()
  dropdown.props.menu.items[0].onClick()
  assert.deepEqual(calls, [])
})
