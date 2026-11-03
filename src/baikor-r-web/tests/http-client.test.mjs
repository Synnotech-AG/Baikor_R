import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import { createServer } from 'vite'

let server
let httpClient
let registerServerErrorListener

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ httpClient } = await server.ssrLoadModule('/src/api/http-client.ts'))
  ;({ registerServerErrorListener } = await server.ssrLoadModule(
    '/src/api/server-error-middleware.ts',
  ))
})
after(async () => {
  await server?.close()
})

test('superseded search cancellation still rejects without a global server-outage notification', async () => {
  const events = []
  const stop = registerServerErrorListener((event) => events.push(event))
  try {
    await assert.rejects(
      httpClient.get('/api/routes', {
        adapter: async () => {
          throw new axios.CanceledError('superseded search')
        },
      }),
      axios.isCancel,
    )
    assert.deepEqual(events, [])
  } finally {
    stop()
  }
})

test('genuine server and network failures still notify globally', async () => {
  const events = []
  const stop = registerServerErrorListener((event) => events.push(event))
  try {
    for (const response of [{ status: 500, data: { title: 'Unavailable' } }, undefined]) {
      await assert.rejects(
        httpClient.get('/api/routes', {
          adapter: async () => {
            throw new axios.AxiosError('Failed', 'ERR_NETWORK', undefined, undefined, response)
          },
        }),
      )
    }
    assert.equal(events.length, 2)
    assert.equal(events[0].fallbackMessage, 'Unavailable')
  } finally {
    stop()
  }
})

test('validation or denied-access responses remain local to their callers', async () => {
  const events = []
  const stop = registerServerErrorListener((event) => events.push(event))
  try {
    await assert.rejects(
      httpClient.get('/api/routes', {
        adapter: async () => {
          throw new axios.AxiosError('Forbidden', undefined, undefined, undefined, { status: 403 })
        },
      }),
    )
    assert.deepEqual(events, [])
  } finally {
    stop()
  }
})
