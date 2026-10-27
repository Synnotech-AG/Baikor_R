import assert from 'node:assert/strict'
import test from 'node:test'
import { GeometryHistory } from '../src/features/construction-sites/map/geometrySnapshots.ts'

const area = (key = 'saved-1', id = 'saved-1', x = 10) => ({
  key, id, name: 'Area 1', coordinates: [[[x, 20], [30, 20], [30, 40], [x, 20]]],
})

test('undo restores modified saved coordinates and clears dirty state at the loaded base', () => {
  const history = new GeometryHistory()
  history.reset([area()])
  assert.equal(history.record([area('saved-1', 'saved-1', 15)]), true)
  assert.equal(history.isDirty, true)
  assert.deepEqual(history.undo(), [area()])
  assert.equal(history.isDirty, false)
  assert.equal(history.canUndo, false)
})

test('undo reverses completed drawing and deletion while preserving local and persisted IDs', () => {
  const history = new GeometryHistory()
  history.reset([area()])
  history.record([area(), area('local-area-1', null)])
  history.record([area('local-area-1', null)])
  assert.deepEqual(history.undo(), [area(), area('local-area-1', null)])
  assert.equal(history.isDirty, true)
  assert.deepEqual(history.undo(), [area()])
  assert.equal(history.isDirty, false)
})

test('history isolates nested input and restored coordinates from later mutations', () => {
  const history = new GeometryHistory()
  const loaded = [area()]
  history.reset(loaded)
  loaded[0].coordinates[0][0][0] = 999
  const edited = [area('saved-1', 'saved-1', 15)]
  history.record(edited)
  edited[0].coordinates[0][0][0] = 888
  const restored = history.undo()
  assert.equal(restored[0].coordinates[0][0][0], 10)
  restored[0].coordinates[0][0][0] = 777
  assert.equal(history.record([area()]), false)
  assert.equal(history.isDirty, false)
})

test('unchanged modification and feature order do not create dirty state or undo entries', () => {
  const history = new GeometryHistory()
  history.reset([area(), area('saved-2', 'saved-2')])
  assert.equal(history.record([area('saved-2', 'saved-2'), area()]), false)
  assert.equal(history.canUndo, false)
  assert.equal(history.isDirty, false)
})

test('an in-progress vertex drag can be detected without recording intermediate undo entries', () => {
  const history = new GeometryHistory()
  history.reset([area()])
  assert.equal(history.hasChanges([area('saved-1', 'saved-1', 15)]), true)
  assert.equal(history.hasChanges([area()]), false)
  assert.equal(history.isDirty, false)
  assert.equal(history.canUndo, false)
  history.record([area('saved-1', 'saved-1', 15)])
  assert.deepEqual(history.undo(), [area()])
})

test('loading another record resets undo and dirty state, including an empty new draft', () => {
  const history = new GeometryHistory()
  history.reset([area()])
  history.record([])
  history.reset([])
  assert.equal(history.canUndo, false)
  assert.equal(history.isDirty, false)
  history.record([area('local-area-1', null)])
  assert.deepEqual(history.undo(), [])
  assert.equal(history.isDirty, false)
  assert.equal(history.undo(), null)
})

test('undo history is bounded without losing comparison against the original base', () => {
  const history = new GeometryHistory(2)
  history.reset([area()])
  history.record([area('saved-1', 'saved-1', 11)])
  history.record([area('saved-1', 'saved-1', 12)])
  history.record([area('saved-1', 'saved-1', 13)])
  assert.equal(history.undo()[0].coordinates[0][0][0], 12)
  assert.equal(history.undo()[0].coordinates[0][0][0], 11)
  assert.equal(history.undo(), null)
  assert.equal(history.isDirty, true)
})
