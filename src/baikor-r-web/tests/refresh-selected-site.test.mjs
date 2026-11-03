import assert from 'node:assert/strict'
import test from 'node:test'
import { refreshSelectedSite } from '../src/features/construction-sites/refresh-selected-site.ts'

test('refresh includes the newly selected archived site when selection changes during a lookup', async () => {
  let selectedId = 'archived-a'
  const calls = []
  const sites = [{ id: 'active', isDeleted: false }]
  const result = await refreshSelectedSite(
    sites,
    () => selectedId,
    async (id) => {
      calls.push(id)
      if (id === 'archived-a') {
        selectedId = 'archived-b'
      }
      return { id, isDeleted: true, version: 2 }
    },
    () => true,
  )
  assert.deepEqual(calls, ['archived-a', 'archived-b'])
  assert.ok(result.some((site) => site.id === selectedId && site.isDeleted))
  assert.deepEqual(sites, [{ id: 'active', isDeleted: false }])
})

test('missing legacy selections are checked once without resurrecting cached records', async () => {
  let calls = 0
  const result = await refreshSelectedSite(
    [],
    () => 'deleted',
    async () => {
      calls++
      return null
    },
    () => true,
  )
  assert.equal(calls, 1)
  assert.deepEqual(result, [])
})

test('superseded list requests do not start selection lookups', async () => {
  const result = await refreshSelectedSite(
    [],
    () => 'archived',
    async () => {
      assert.fail('A newer archive filter has already started loading')
    },
    () => false,
  )
  assert.deepEqual(result, [])
})

test('lookup failures propagate instead of treating inaccessible sites as deleted', async () => {
  const failure = new Error('network unavailable')
  await assert.rejects(
    refreshSelectedSite(
      [],
      () => 'archived',
      async () => {
        throw failure
      },
      () => true,
    ),
    failure,
  )
})
