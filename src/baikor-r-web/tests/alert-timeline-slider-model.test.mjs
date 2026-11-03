import assert from 'node:assert/strict'
import test from 'node:test'
import {
  timelineIndexAtPointer,
  timelineKeyboardIndex,
} from '../src/features/alerts/live/alert-timeline-slider-model.ts'

const settings = { from: '2026-11-01', to: '2026-11-30', windowDays: 10, playbackSpeed: 1 }
const bounds = { left: 10, width: 300 }

test('dragging a ten-day block through a thirty-day track preserves its grabbed position', () => {
  assert.equal(timelineIndexAtPointer(settings, bounds, 60, 0.5), 0)
  assert.equal(timelineIndexAtPointer(settings, bounds, 160, 0.5), 10)
  assert.equal(timelineIndexAtPointer(settings, bounds, 260, 0.5), 20)
  assert.equal(timelineIndexAtPointer(settings, bounds, 200, 0.9), 10)
  assert.equal(timelineIndexAtPointer(settings, bounds, 110, 0), 10)
})

test('track clicks clamp whole windows at either boundary and ignore hidden tracks', () => {
  assert.equal(timelineIndexAtPointer(settings, bounds, -50), 0)
  assert.equal(timelineIndexAtPointer(settings, bounds, 400), 20)
  assert.equal(timelineIndexAtPointer(settings, { left: 0, width: 0 }, 20), null)
  assert.equal(timelineIndexAtPointer(settings, bounds, Number.NaN), null)
  assert.equal(timelineIndexAtPointer({ ...settings, windowDays: 100 }, bounds, 200), 0)
})

test('an extended hit target retains the actual offset outside a one-day visual window', () => {
  const narrow = { from: '2026-01-01', to: '2026-12-31', windowDays: 1, playbackSpeed: 1 }
  const track = { left: 0, width: 365 }
  assert.equal(timelineIndexAtPointer(narrow, track, 95, -5), 100)
  assert.equal(timelineIndexAtPointer(narrow, track, 106, 6), 100)
  assert.equal(timelineIndexAtPointer(narrow, track, 107, 6), 101)
})

test('keyboard navigation moves daily or weekly and stops at the last full window', () => {
  assert.equal(timelineKeyboardIndex(settings, 0, 'ArrowRight'), 1)
  assert.equal(timelineKeyboardIndex(settings, 3, 'PageUp'), 10)
  assert.equal(timelineKeyboardIndex(settings, 3, 'PageDown'), 0)
  assert.equal(timelineKeyboardIndex(settings, 0, 'Home'), 0)
  assert.equal(timelineKeyboardIndex(settings, 0, 'End'), 20)
  assert.equal(timelineKeyboardIndex(settings, 20, 'ArrowRight'), 20)
  assert.equal(timelineKeyboardIndex(settings, 0, 'Escape'), null)
})
