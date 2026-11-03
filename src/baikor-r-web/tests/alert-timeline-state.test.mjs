import assert from 'node:assert/strict'
import test from 'node:test'
import { reduceAlertTimeline } from '../src/features/alerts/live/alert-timeline-state.ts'
import {
  timelineDateAt,
  timelineWindowAt,
} from '../src/features/alerts/live/alert-timeline-model.ts'

const settings = { from: '2026-11-03', to: '2026-11-13', windowDays: 7, playbackSpeed: 1 }
const initial = { enabled: false, playing: false, index: 0, settings }
const enabled = { ...initial, enabled: true }

test('enter starts paused at the requested first day and exit stops playback', () => {
  const entered = reduceAlertTimeline(initial, { type: 'enter', settings })
  assert.deepEqual(entered, enabled)
  const playing = reduceAlertTimeline(entered, { type: 'play' })
  assert.equal(playing.playing, true)
  const exited = reduceAlertTimeline(playing, { type: 'exit' })
  assert.equal(exited.enabled, false)
  assert.equal(exited.playing, false)
  assert.deepEqual(reduceAlertTimeline(exited, { type: 'tick' }), exited)
})

test('play always advances one day even when the display window spans seven days', () => {
  let state = reduceAlertTimeline(enabled, { type: 'play' })
  state = reduceAlertTimeline(state, { type: 'tick' })
  assert.equal(timelineDateAt(settings, state.index), '2026-11-04')
  assert.equal(state.playing, true)
  for (let remaining = 0; remaining < 9; remaining++) {
    state = reduceAlertTimeline(state, { type: 'tick' })
  }
  assert.equal(timelineDateAt(settings, state.index), '2026-11-07')
  assert.deepEqual(timelineWindowAt(settings, state.index), {
    from: '2026-11-07',
    to: '2026-11-13',
  })
  assert.equal(state.playing, false)
  assert.deepEqual(reduceAlertTimeline(state, { type: 'tick' }), state)
  const replay = reduceAlertTimeline(state, { type: 'play' })
  assert.equal(replay.index, 0)
  assert.equal(replay.playing, true)
})

test('manual seeking pauses playback and clamps invalid or outside positions', () => {
  const playing = { ...enabled, playing: true }
  assert.deepEqual(reduceAlertTimeline(playing, { type: 'seek', index: 500 }), {
    ...enabled,
    index: 4,
  })
  assert.equal(reduceAlertTimeline(playing, { type: 'seek', index: -10 }).index, 0)
  assert.equal(reduceAlertTimeline(playing, { type: 'seek', index: Number.NaN }).index, 0)
  assert.equal(reduceAlertTimeline(playing, { type: 'pause' }).playing, false)
})

test('configuration preserves the current day where possible, pauses and rejects invalid ranges', () => {
  const previous = { ...enabled, playing: true, index: 1 }
  const nextSettings = { from: '2026-11-01', to: '2026-11-30', windowDays: 1, playbackSpeed: 1 }
  const next = reduceAlertTimeline(previous, { type: 'configure', settings: nextSettings })
  assert.equal(timelineDateAt(nextSettings, next.index), '2026-11-04')
  assert.equal(next.playing, false)
  const outside = reduceAlertTimeline(next, {
    type: 'configure',
    settings: { ...settings, from: '2026-11-12' },
  })
  assert.equal(outside.index, 0)
  assert.equal(
    reduceAlertTimeline(next, { type: 'configure', settings: { ...settings, windowDays: 0 } }),
    next,
  )
  assert.deepEqual(settings, {
    from: '2026-11-03',
    to: '2026-11-13',
    windowDays: 7,
    playbackSpeed: 1,
  })
})

test('a single-day range cannot start a timer and ticks while disabled are ignored', () => {
  const single = { ...enabled, settings: { ...settings, to: settings.from } }
  assert.equal(reduceAlertTimeline(single, { type: 'play' }).playing, false)
  assert.equal(reduceAlertTimeline(initial, { type: 'play' }).playing, false)
})
