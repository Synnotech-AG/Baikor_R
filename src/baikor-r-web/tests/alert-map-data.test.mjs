import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadWorkspaceAlerts,
  shouldReloadWorkspaceAlerts,
} from '../src/features/alerts/alert-map-data.ts'
import { buildAlertQuery } from '../src/features/alerts/alert-model.ts'

test('map queries read present alerts across types, handling states and periods in larger pages', () => {
  const filters = { search: '', type: 'all', condition: 'present', handling: 'all', period: 'all' }
  assert.deepEqual(buildAlertQuery(filters, 2, 100), {
    condition: 'present',
    page: 2,
    pageSize: 100,
  })
  assert.deepEqual(buildAlertQuery(filters, 2), {
    condition: 'present',
    page: 2,
    pageSize: 25,
  })
})

function alert(id, handling = 'open') {
  return {
    id,
    type: 'route-conflict',
    summary: id,
    description: null,
    condition: 'present',
    handling,
    occurrence: 1,
    evidenceRevision: 1,
    location: { type: 'Point', coordinates: [320000, 5430000] },
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    lastEvaluatedAt: '2026-11-01T00:00:00Z',
    version: 1,
  }
}

function pages(responses) {
  const requested = []
  return {
    requested,
    fetch: async (page, signal) => {
      signal?.throwIfAborted()
      requested.push(page)
      const response = responses[page - 1]
      assert.ok(response, `Unexpected request for page ${page}`)
      return { ...response, page: response.page ?? page }
    },
  }
}

test('workspace alert loading reads every summary page and preserves all handling states', async () => {
  const first = alert('a')
  const second = alert('b', 'acknowledged')
  const third = alert('c', 'handled')
  const source = pages([
    { items: [first, second], totalCount: 3, pageSize: 2 },
    { items: [third], totalCount: 3, pageSize: 2 },
  ])
  assert.deepEqual(await loadWorkspaceAlerts(source.fetch), [first, second, third])
  assert.deepEqual(source.requested, [1, 2])
})

test('an empty alert collection completes without another request', async () => {
  const source = pages([{ items: [], totalCount: 0, pageSize: 25 }])
  assert.deepEqual(await loadWorkspaceAlerts(source.fetch), [])
  assert.deepEqual(source.requested, [1])
})

test('repeated alert UUIDs are deduplicated across pages with complete unique coverage', async () => {
  const first = alert('a')
  const second = alert('b')
  const third = alert('c')
  const source = pages([
    { items: [first, second], totalCount: 3, pageSize: 2 },
    { items: [second, third], totalCount: 3, pageSize: 2 },
  ])
  assert.deepEqual(await loadWorkspaceAlerts(source.fetch), [first, second, third])
  assert.deepEqual(source.requested, [1, 2])
})

test('a prematurely empty page rejects instead of returning partial alert data', async () => {
  const source = pages([
    { items: [alert('a')], totalCount: 2, pageSize: 1 },
    { items: [], totalCount: 2, pageSize: 1 },
  ])
  await assert.rejects(loadWorkspaceAlerts(source.fetch), /changed while loading/i)
})

test('changed pagination metadata rejects instead of committing an inconsistent snapshot', async () => {
  for (const changed of [{ totalCount: 3 }, { pageSize: 2 }, { page: 1 }]) {
    const source = pages([
      { items: [alert('a')], totalCount: 2, pageSize: 1 },
      { items: [alert('b')], totalCount: 2, pageSize: 1, ...changed },
    ])
    await assert.rejects(loadWorkspaceAlerts(source.fetch), /changed while loading/i)
  }
})

test('duplicate pages cannot make a partial unique alert list appear complete', async () => {
  const source = pages([
    { items: [alert('a')], totalCount: 2, pageSize: 1 },
    { items: [alert('a')], totalCount: 2, pageSize: 1 },
  ])
  await assert.rejects(loadWorkspaceAlerts(source.fetch), /changed while loading/i)
  assert.deepEqual(source.requested, [1, 2])
})

test('failed subsequent pages reject the whole load', async () => {
  const failure = new Error('Network unavailable')
  await assert.rejects(
    loadWorkspaceAlerts(async (page) => {
      if (page === 1) {
        return { items: [alert('a')], totalCount: 2, page: 1, pageSize: 1 }
      }
      throw failure
    }),
    (caught) => caught === failure,
  )
})

test('aborted loading stops before the next page even if an endpoint ignores cancellation', async () => {
  const controller = new AbortController()
  const requested = []
  await assert.rejects(
    loadWorkspaceAlerts(async (page, signal) => {
      requested.push(page)
      assert.equal(signal, controller.signal)
      controller.abort()
      return { items: [alert('a')], totalCount: 2, page: 1, pageSize: 1 }
    }, controller.signal),
    { name: 'AbortError' },
  )
  assert.deepEqual(requested, [1])
})

test('an already cancelled load does not request its first page', async () => {
  const controller = new AbortController()
  controller.abort()
  const source = pages([{ items: [], totalCount: 0, pageSize: 25 }])
  await assert.rejects(loadWorkspaceAlerts(source.fetch, controller.signal), {
    name: 'AbortError',
  })
  assert.deepEqual(source.requested, [])
})

test('invalid pagination metadata rejects without an endless page loop', async () => {
  for (const invalid of [
    { pageSize: 0 },
    { pageSize: Number.NaN },
    { totalCount: -1 },
    { totalCount: Infinity },
    { totalCount: 1.5 },
  ]) {
    const source = pages([{ items: [alert('a')], totalCount: 1, pageSize: 1, ...invalid }])
    await assert.rejects(loadWorkspaceAlerts(source.fetch), /changed while loading/i)
    assert.deepEqual(source.requested, [1])
  }
})

test('detection polling refreshes the initial snapshot, then only completed work or new evaluations', () => {
  const quiet = { pendingCount: 0, failedCount: 0, lastEvaluatedAt: '2026-11-01T00:00:00Z' }
  const pending = { ...quiet, pendingCount: 3 }
  assert.equal(shouldReloadWorkspaceAlerts(null, quiet), true)
  assert.equal(shouldReloadWorkspaceAlerts(quiet, quiet), false)
  assert.equal(shouldReloadWorkspaceAlerts(quiet, pending), false)
  assert.equal(shouldReloadWorkspaceAlerts(pending, { ...pending, pendingCount: 2 }), false)
  assert.equal(shouldReloadWorkspaceAlerts(pending, quiet), true)
  assert.equal(
    shouldReloadWorkspaceAlerts(pending, {
      ...pending,
      lastEvaluatedAt: '2026-11-01T00:01:00Z',
    }),
    true,
  )
})
