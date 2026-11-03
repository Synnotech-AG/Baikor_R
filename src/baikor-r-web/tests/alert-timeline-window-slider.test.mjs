import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { createInstance } from 'i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import {
  alertTimelineDe,
  alertTimelineEn,
} from '../src/features/alerts/live/alert-timeline-messages.ts'

let server
let WindowSlider
const i18n = createInstance()
const settings = { from: '2026-11-01', to: '2026-11-30', windowDays: 10, playbackSpeed: 1 }

before(async () => {
  await i18n.init({
    lng: 'de',
    keySeparator: false,
    resources: { de: { translation: alertTimelineDe }, en: { translation: alertTimelineEn } },
  })
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ AlertTimelineWindowSlider: WindowSlider } = await server.ssrLoadModule(
    '/src/features/alerts/live/alert-timeline-window-slider.tsx',
  ))
})
after(async () => {
  await server?.close()
})

function capture(props = {}) {
  let tree
  function Capture() {
    tree = WindowSlider({ settings, index: 0, onSeek() {}, ...props })
    return tree
  }
  const html = renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(Capture)),
  )
  const track = React.Children.toArray(tree.props.children)[0]
  const thumb = track.props.children
  return { html, track, thumb }
}

function pointerHarness(props = {}, bounds = { left: 0, width: 300 }) {
  const captured = new Set()
  const calls = []
  const ui = capture({
    onPause: () => calls.push('pause'),
    onSeek: (value) => calls.push(value),
    ...props,
  })
  const thumb = { contains: (target) => target === thumb, focus() {} }
  const track = {
    getBoundingClientRect: () => bounds,
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => assert.ok(captured.delete(id)),
  }
  ui.track.props.ref.current = track
  ui.thumb.props.ref.current = thumb
  const event = (clientX, extra = {}) => ({
    pointerId: 1,
    clientX,
    button: 0,
    isPrimary: true,
    target: thumb,
    currentTarget: track,
    preventDefault() {},
    stopPropagation() {},
    ...extra,
  })
  return { ...ui, captured, calls, event, trackElement: track }
}

for (const language of ['de', 'en']) {
  test(`the slider thumb occupies one third for ten of thirty days and exposes both dates (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { html, thumb } = capture()
    assert.equal(thumb.props.role, 'slider')
    assert.ok(Math.abs(Number.parseFloat(thumb.props.style.width) - 100 / 3) < 1e-10)
    assert.equal(thumb.props.style.left, '0%')
    assert.equal(thumb.props['aria-valuemax'], 20)
    assert.equal(thumb.props['aria-label'], i18n.t('alerts.timeline.slider'))
    assert.ok(
      thumb.props['aria-valuetext'].includes(language === 'de' ? '10.11.2026' : '10/11/2026'),
    )
    assert.ok(html.includes('role="slider"'))
  })
}

test('dragging moves the whole window without jumping at grab or releasing an uncaptured pointer', () => {
  const ui = pointerHarness()
  ui.track.props.onPointerDown(ui.event(50))
  assert.deepEqual(ui.calls, ['pause'])
  assert.ok(ui.captured.has(1))
  ui.track.props.onPointerMove(ui.event(150))
  ui.track.props.onPointerUp(ui.event(250))
  assert.deepEqual(ui.calls, ['pause', 10, 20])
  assert.equal(ui.captured.size, 0)
  ui.track.props.onLostPointerCapture(ui.event(250))
  ui.track.props.onPointerUp(ui.event(250))
  assert.deepEqual(ui.calls, ['pause', 10, 20])
})

test('track clicks center the window; other pointer ids and cancellation cannot commit a new position', () => {
  const ui = pointerHarness()
  ui.track.props.onPointerDown(ui.event(150, { target: ui.trackElement }))
  assert.deepEqual(ui.calls, ['pause', 10])
  ui.track.props.onPointerMove(ui.event(250, { pointerId: 2 }))
  ui.track.props.onPointerCancel(ui.event(250))
  assert.deepEqual(ui.calls, ['pause', 10])
  assert.equal(ui.captured.size, 0)
  ui.track.props.onPointerDown(ui.event(200, { button: 2 }))
  assert.equal(ui.captured.size, 0)
})

test('grabbing a narrow window through its larger hit target does not jump on release', () => {
  const narrow = { from: '2026-01-01', to: '2026-12-31', windowDays: 1, playbackSpeed: 1 }
  const ui = pointerHarness({ settings: narrow, index: 100 }, { left: 0, width: 365 })
  ui.track.props.onPointerDown(ui.event(95))
  ui.track.props.onPointerUp(ui.event(95))
  assert.deepEqual(ui.calls, ['pause'])
  ui.track.props.onPointerDown(ui.event(106))
  ui.track.props.onPointerMove(ui.event(107))
  ui.track.props.onPointerUp(ui.event(107))
  assert.deepEqual(ui.calls, ['pause', 'pause', 101])
})

test('keyboard changes are daily, pause playback and keep a full window at End', () => {
  const calls = []
  const { thumb } = capture({
    index: 5,
    onPause: () => calls.push('pause'),
    onSeek: (index) => calls.push(index),
  })
  const event = (key) => ({ key, preventDefault() {}, stopPropagation() {} })
  thumb.props.onKeyDown(event('ArrowRight'))
  thumb.props.onKeyDown(event('End'))
  thumb.props.onKeyDown(event('Escape'))
  assert.deepEqual(calls, ['pause', 6, 'pause', 20])
})

test('a window covering the whole range is full-width and cannot be dragged or played through', () => {
  const ui = pointerHarness({ settings: { ...settings, windowDays: 1000 } })
  assert.equal(ui.thumb.props.style.width, '100%')
  assert.equal(ui.thumb.props['aria-disabled'], true)
  assert.equal(ui.thumb.props.tabIndex, -1)
  ui.track.props.onPointerDown(ui.event(100))
  ui.thumb.props.onKeyDown({
    key: 'ArrowRight',
    preventDefault() {
      assert.fail()
    },
  })
  assert.deepEqual(ui.calls, [])
})
