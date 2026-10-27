import assert from 'node:assert/strict'
import test from 'node:test'
import { findDropTarget, resizedRatio } from '../src/shared/docking/interactions.ts'

const panels = { source: { x: 0, y: 0, width: 300, height: 300 }, target: { x: 310, y: 0, width: 400, height: 300 } }
test('only another panel edge accepts a drop, with all four placement directions', () => {
  assert.deepEqual(findDropTarget({ x: 315, y: 150 }, panels, 'source'), { panelId: 'target', edge: 'left' })
  assert.deepEqual(findDropTarget({ x: 705, y: 150 }, panels, 'source'), { panelId: 'target', edge: 'right' })
  assert.deepEqual(findDropTarget({ x: 500, y: 5 }, panels, 'source'), { panelId: 'target', edge: 'top' })
  assert.deepEqual(findDropTarget({ x: 500, y: 295 }, panels, 'source'), { panelId: 'target', edge: 'bottom' })
  assert.equal(findDropTarget({ x: 500, y: 150 }, panels, 'source'), null)
  assert.equal(findDropTarget({ x: 5, y: 150 }, panels, 'source'), null)
  assert.equal(findDropTarget({ x: -5, y: 150 }, panels, 'source'), null)
})
test('resizing applies axis-relative deltas and stops at measured limits', () => {
  assert.equal(resizedRatio(0.5, 50, 500, 0.2, 0.7), 0.6)
  assert.equal(resizedRatio(0.5, 500, 500, 0.2, 0.7), 0.7)
  assert.equal(resizedRatio(0.5, -500, 500, 0.2, 0.7), 0.2)
  assert.equal(resizedRatio(0.5, 50, 0, 0.2, 0.7), 0.5)
})
