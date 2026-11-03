import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server
let useDeleteRoutePathEndpoint
let httpClient

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ useDeleteRoutePathEndpoint } = await server.ssrLoadModule('/src/features/routes/api.ts'))
  ;({ httpClient } = await server.ssrLoadModule('/src/api/http-client.ts'))
})

after(async () => {
  await server?.close()
})

function endpoint() {
  let result
  function Probe() {
    result = useDeleteRoutePathEndpoint()
    return null
  }
  renderToStaticMarkup(React.createElement(Probe))
  return result
}

test('deleting one path encodes both identities, sends the parent version and returns the updated parent', async () => {
  let request
  const parent = { id: 'route', version: 9, paths: [{ id: 'path', isSuppressed: true }] }
  httpClient.defaults.adapter = async (config) => {
    request = config
    return { data: parent, status: 200, statusText: 'OK', headers: {}, config }
  }
  const result = await endpoint().execute('route/1', 'path ?2', 8)
  assert.deepEqual(result, parent)
  assert.equal(request.method, 'delete')
  assert.equal(request.url, '/api/routes/route%2F1/paths/path%20%3F2')
  assert.deepEqual(JSON.parse(request.data), { version: 8 })
})

test('failed path deletions propagate instead of returning a fabricated parent', async () => {
  const failure = new Error('version conflict')
  httpClient.defaults.adapter = async () => {
    throw failure
  }
  await assert.rejects(endpoint().execute('route', 'path', 8), (error) => error === failure)
})
