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

test('Baikor API requests identify the SPA and limit session and CSRF headers to the app origin', async () => {
  const { setAntiforgeryToken } = await server.ssrLoadModule('/src/api/http-client.ts')
  const captured = []
  const adapter = async (config) => {
    captured.push(config.headers.toJSON())
    return { config, data: {}, status: 200, headers: {} }
  }
  setAntiforgeryToken('csrf-test')
  try {
    await httpClient.post('/api/routes', {}, { adapter })
    await httpClient.post('https://external.example/api/routes', {}, { adapter })
  } finally {
    setAntiforgeryToken(null)
  }
  assert.equal(captured[0]['X-Baikor-Session'], '1')
  assert.equal(captured[0]['X-CSRF-TOKEN'], 'csrf-test')
  assert.equal(captured[1]['X-Baikor-Session'], undefined)
  assert.equal(captured[1]['X-CSRF-TOKEN'], undefined)
})

test('automatic detection and import polling cannot renew an idle session', async () => {
  const { getAlerts, getDetectionStatus } = await server.ssrLoadModule(
    '/src/features/alerts/api.ts',
  )
  const { defaultAlertFilters } = await server.ssrLoadModule('/src/features/alerts/alert-model.ts')
  const { getMailImportSettings, getMailImportStatus, getMailImportHistory } =
    await server.ssrLoadModule('/src/features/import/mail-import-api.ts')
  const previous = httpClient.defaults.adapter
  const headers = []
  httpClient.defaults.adapter = async (config) => {
    headers.push(config.headers.get('X-Baikor-Session-Probe'))
    return { config, data: {}, status: 200, headers: {} }
  }
  try {
    await Promise.all([
      getDetectionStatus(),
      getAlerts(defaultAlertFilters, 1),
      getMailImportSettings(),
      getMailImportStatus(),
      getMailImportHistory(1),
    ])
  } finally {
    httpClient.defaults.adapter = previous
  }
  assert.deepEqual(headers, ['1', '1', '1', '1', '1'])
})

async function openTab(t, answer) {
  const { monitorBrowserSession } = await server.ssrLoadModule('/src/api/browser-session.ts')
  const navigations = []
  const requests = []
  global.window = Object.assign(new EventTarget(), {
    location: { href: 'https://baikor.test/', replace: (path) => navigations.push(path) },
  })
  global.document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const previous = httpClient.defaults.adapter
  httpClient.defaults.adapter = async (config) => {
    requests.push(config)
    const [status, remaining] = await answer(config)
    const response = {
      config,
      data: {},
      status,
      headers: remaining === undefined ? {} : { 'x-baikor-session-remaining': String(remaining) },
    }
    if (status >= 400) {
      throw new axios.AxiosError('Failed', undefined, config, undefined, response)
    }
    return response
  }
  const stop = monitorBrowserSession(() => navigations.push('unmounted'))
  t.after(() => {
    stop()
    delete global.window
    delete global.document
    httpClient.defaults.adapter = previous
  })
  return { navigations, requests }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('an idle tab checks the real cookie at expiry, accepts renewal elsewhere, and leaves on confirmed expiry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const replies = [[200, 2], [200, 3], [401]]
  const { navigations, requests } = await openTab(t, () => replies.shift())
  await httpClient.get('/api/me')
  t.mock.timers.tick(1999)
  await flush()
  assert.equal(requests.length, 1)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(requests.length, 2)
  assert.equal(requests[1].url, '/api/me')
  assert.equal(requests[1].headers.get('X-Baikor-Session-Probe'), '1')
  assert.deepEqual(navigations, [])
  t.mock.timers.tick(3000)
  await flush()
  assert.deepEqual(navigations, ['unmounted', '/signed-out.html'])
})

test('a rejected API write leaves once, and external 401s and denied access leave the app open', async (t) => {
  const replies = [[401], [403], [401], [401]]
  const { requests, navigations } = await openTab(t, () => replies.shift())
  await assert.rejects(httpClient.get('https://external.example/api/routes'))
  await assert.rejects(httpClient.get('/api/settings/mail-import'))
  assert.deepEqual(navigations, [])
  await Promise.allSettled([httpClient.post('/api/routes', {}), httpClient.get('/api/me')])
  assert.deepEqual(navigations, ['unmounted', '/signed-out.html'])
  assert.equal(requests.length, 4)
})

test('resuming a tab coalesces session checks and retries a temporary outage without signing out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const replies = [[200, 3600], [503], [401]]
  const { requests, navigations } = await openTab(t, () => replies.shift())
  await httpClient.get('/api/me')
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('focus'))
  await flush()
  assert.equal(requests.length, 2)
  assert.deepEqual(navigations, [])
  t.mock.timers.tick(30000)
  await flush()
  assert.deepEqual(navigations, ['unmounted', '/signed-out.html'])
})
