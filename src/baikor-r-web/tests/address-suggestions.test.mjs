import assert from 'node:assert/strict'
import test from 'node:test'
import { AddressSuggestions } from '../src/features/construction-sites/map/AddressSuggestions.ts'

const address = (id, displayName = id) => ({
  id, displayName, latitude: 49.0134, longitude: 12.1016,
  boundingBox: [49.01, 49.02, 12.1, 12.11],
})

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const requests = []
  let state
  const suggestions = new AddressSuggestions((query) => new Promise((resolve, reject) => {
    requests.push({ query, resolve, reject })
  }), (next) => { state = next })
  t.after(() => suggestions.dispose())
  return { suggestions, requests, get state() { return state } }
}

const settle = async () => { await Promise.resolve(); await Promise.resolve() }

test('typing debounces the latest query and never selects a pending address', async (t) => {
  const fixture = setup(t)
  fixture.suggestions.updateQuery('Re')
  t.mock.timers.tick(450)
  assert.equal(fixture.requests.length, 0)
  fixture.suggestions.updateQuery('Regen')
  t.mock.timers.tick(300)
  fixture.suggestions.updateQuery('Regensburg')
  t.mock.timers.tick(449)
  assert.equal(fixture.requests.length, 0)
  assert.equal(fixture.suggestions.select('first'), undefined)
  t.mock.timers.tick(1)
  assert.equal(fixture.requests.length, 1)
  assert.equal(fixture.requests[0].query, 'Regensburg')
  assert.equal(fixture.suggestions.select('first'), undefined)
  fixture.requests[0].resolve([address('first'), address('second')])
  await settle()
  assert.equal(fixture.state.status, 'ready')
  assert.equal(fixture.state.query, 'Regensburg')
  assert.equal(fixture.requests.length, 1)
})

test('selection uses a displayed result without another lookup and clears the suggestion list', async (t) => {
  const fixture = setup(t)
  fixture.suggestions.updateQuery('Regensburg')
  t.mock.timers.tick(450)
  fixture.requests[0].resolve([address('first', 'First address'), address('second', 'Second address')])
  await settle()
  assert.equal(fixture.suggestions.select('second').displayName, 'Second address')
  assert.equal(fixture.state.query, 'Second address')
  assert.deepEqual(fixture.state.results, [])
  assert.equal(fixture.suggestions.select('second'), undefined)
  t.mock.timers.tick(450)
  assert.equal(fixture.requests.length, 1)
})

test('changing the query immediately prevents selection of previously displayed suggestions', async (t) => {
  const fixture = setup(t)
  fixture.suggestions.updateQuery('Old address')
  t.mock.timers.tick(450)
  fixture.requests[0].resolve([address('old')])
  await settle()
  fixture.suggestions.updateQuery('New address')
  assert.equal(fixture.suggestions.select('old'), undefined)
  assert.deepEqual(fixture.state.results, [])
  assert.equal(fixture.state.status, 'searching')
})

test('an older response cannot replace current results or make its address selectable', async (t) => {
  const fixture = setup(t)
  fixture.suggestions.updateQuery('Old address')
  t.mock.timers.tick(450)
  fixture.suggestions.updateQuery('New address')
  t.mock.timers.tick(450)
  fixture.requests[1].resolve([address('new')])
  await settle()
  fixture.requests[0].resolve([address('old')])
  await settle()
  assert.deepEqual(fixture.state.results.map((result) => result.id), ['new'])
  assert.equal(fixture.suggestions.select('old'), undefined)
  assert.equal(fixture.suggestions.select('new').id, 'new')
})

test('an older failure cannot hide the current results', async (t) => {
  const fixture = setup(t)
  fixture.suggestions.updateQuery('Old address')
  t.mock.timers.tick(450)
  fixture.suggestions.updateQuery('New address')
  t.mock.timers.tick(450)
  fixture.requests[1].resolve([address('new')])
  await settle()
  fixture.requests[0].reject(new Error('Offline'))
  await settle()
  assert.equal(fixture.state.status, 'ready')
  assert.equal(fixture.state.results[0].id, 'new')
})

test('clearing cancels scheduled work and ignores an outstanding response', async (t) => {
  const fixture = setup(t)
  fixture.suggestions.updateQuery('Scheduled address')
  fixture.suggestions.updateQuery('')
  t.mock.timers.tick(450)
  assert.equal(fixture.requests.length, 0)
  fixture.suggestions.updateQuery('Requested address')
  t.mock.timers.tick(450)
  fixture.suggestions.updateQuery('')
  fixture.requests[0].resolve([address('old')])
  await settle()
  assert.equal(fixture.state.query, '')
  assert.equal(fixture.state.status, 'idle')
  assert.deepEqual(fixture.state.results, [])
  assert.equal(fixture.suggestions.select('old'), undefined)
})

test('disposal cancels debounce and prevents updates from an outstanding request', async (t) => {
  const fixture = setup(t)
  fixture.suggestions.updateQuery('Requested address')
  t.mock.timers.tick(450)
  fixture.suggestions.updateQuery('Scheduled address')
  fixture.suggestions.dispose()
  const before = fixture.state
  t.mock.timers.tick(450)
  fixture.requests[0].resolve([address('old')])
  await settle()
  assert.equal(fixture.requests.length, 1)
  assert.equal(fixture.state, before)
  assert.equal(fixture.suggestions.select('old'), undefined)
})

test('empty results and failures expose distinct feedback states without selectable options', async (t) => {
  const fixture = setup(t)
  fixture.suggestions.updateQuery('Missing address')
  t.mock.timers.tick(450)
  fixture.requests[0].resolve([])
  await settle()
  assert.equal(fixture.state.status, 'empty')
  assert.equal(fixture.suggestions.select('any'), undefined)
  fixture.suggestions.updateQuery('Other address')
  t.mock.timers.tick(450)
  fixture.requests[1].reject(new Error('Offline'))
  await settle()
  assert.equal(fixture.state.status, 'failed')
  assert.deepEqual(fixture.state.results, [])
  assert.equal(fixture.suggestions.select('any'), undefined)
})
