import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import dayjs from 'dayjs'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import {
  alertTimelineDe,
  alertTimelineEn,
} from '../src/features/alerts/live/alert-timeline-messages.ts'

let server
let AlertTimelineControl
const i18n = createInstance()
const settings = { from: '2026-11-01', to: '2026-11-30', windowDays: 1, playbackSpeed: 1 }
const noop = () => {}

before(async () => {
  await i18n.init({
    lng: 'de',
    fallbackLng: 'de',
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: {
      de: { translation: alertTimelineDe },
      en: { translation: alertTimelineEn },
    },
  })
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  ;({ AlertTimelineControl } = await server.ssrLoadModule(
    '/src/features/alerts/live/alert-timeline-control.tsx',
  ))
})

after(async () => {
  await server?.close()
})

function descendants(element) {
  if (!React.isValidElement(element)) {
    return []
  }
  return [
    element,
    ...React.Children.toArray(element.props.children).flatMap(descendants),
    ...descendants(element.props.content),
  ]
}

function renderControl(props = {}, operations = []) {
  const pending = [...operations]
  let controls
  function CaptureControl() {
    const tree = AlertTimelineControl({
      enabled: true,
      playing: false,
      date: '2026-11-08',
      settings,
      index: 7,
      maxIndex: 29,
      onEnter: noop,
      onExit: noop,
      onTogglePlaying: noop,
      onSeek: noop,
      onConfigure: noop,
      ...props,
    })
    controls = descendants(tree)
    pending.shift()?.(controls)
    // Configuration cases inspect our state transitions without asking Ant Design
    // to mount an open, client-only portal during server rendering.
    return operations.length > 0 ? null : tree
  }
  const html = renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(CaptureControl)),
  )
  return { html, controls }
}

const named = (controls, key) =>
  controls.find((control) => control.props['aria-label'] === i18n.t(key))
const settingsPopover = (controls) =>
  controls.find((control) => control.props.content?.props.className === 'alert-timeline-settings')
const rangePicker = (controls) => controls.find((control) => control.props.format === 'DD.MM.YYYY')
const applyButton = (controls) =>
  controls.find((control) => control.props.children === i18n.t('alerts.timeline.apply'))
const cancelButton = (controls) =>
  controls.find((control) => control.props.children === i18n.t('alerts.timeline.cancel'))
const windowSlider = (controls) =>
  controls.find((control) => control.type.name === 'AlertTimelineWindowSlider')
const windowInput = (controls) =>
  controls.find((control) => control.props.className === 'alert-timeline-window-input')
const speedSlider = (controls) =>
  controls.find((control) => control.props.className === 'alert-timeline-speed-slider')

for (const language of ['de', 'en']) {
  test(`disabled timeline offers one explicit entry action without starting playback (${language})`, async () => {
    await i18n.changeLanguage(language)
    const calls = []
    const { html, controls } = renderControl({
      enabled: false,
      onEnter: () => calls.push('enter'),
      onTogglePlaying: () => calls.push('play'),
    })
    assert.deepEqual(calls, [])
    assert.equal((html.match(/<button\b/g) ?? []).length, 1)
    assert.ok(html.includes(i18n.t('alerts.timeline.enter')))
    assert.equal(html.includes('role="slider"'), false)
    named(controls, 'alerts.timeline.enter').props.onClick()
    assert.deepEqual(calls, ['enter'])
  })

  test(`timeline labels calendar dates and delegates explicit playback, seek and exit (${language})`, async () => {
    await i18n.changeLanguage(language)
    const calls = []
    const { html, controls } = renderControl({
      count: 0,
      onTogglePlaying: () => calls.push('play'),
      onSeek: (index) => calls.push(['seek', index]),
      onExit: () => calls.push('exit'),
    })
    assert.match(html, /datetime="2026-11-08"/i)
    assert.ok(html.includes(language === 'de' ? '08.11.2026' : '08/11/2026'))
    assert.ok(html.includes(language === 'de' ? '01.11.2026' : '01/11/2026'))
    assert.ok(html.includes(language === 'de' ? '30.11.2026' : '30/11/2026'))
    assert.ok(html.includes(i18n.t('alerts.timeline.count', { count: 0 })))
    const slider = windowSlider(controls)
    assert.ok(slider)
    assert.equal(slider.props.settings, settings)
    assert.equal(slider.props.index, 7)
    assert.equal(slider.props.maxIndex, undefined)
    named(controls, 'alerts.timeline.play').props.onClick()
    slider.props.onSeek(3)
    named(controls, 'alerts.timeline.exit').props.onClick()
    assert.deepEqual(calls, ['play', ['seek', 3], 'exit'])
    const playing = renderControl({ playing: true }).controls
    assert.ok(named(playing, 'alerts.timeline.pause'))
  })

  test(`settings offer one free display-window input with no 365-day cap (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { controls } = renderControl({ settings: { ...settings, windowDays: 2 } }, [
      (controls) => settingsPopover(controls).props.onOpenChange(true),
    ])
    const inputs = controls.filter(
      (control) => control.props.className === 'alert-timeline-window-input',
    )
    assert.equal(inputs.length, 1)
    assert.equal(inputs[0].props.value, 2)
    assert.equal(inputs[0].props.min, 1)
    assert.equal(inputs[0].props.max, undefined)
    assert.equal(inputs[0].props.precision, 0)
    assert.equal(inputs[0].props.suffix, language === 'de' ? 'Tage' : 'days')
    assert.equal(
      inputs[0].props['aria-label'],
      language === 'de' ? 'Anzeigefenster' : 'Display window',
    )
    assert.equal(
      controls.some((control) => control.props.options),
      false,
    )
  })

  test(`display windows change the shown date range without skipping daily slider positions (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const [windowDays, expectedTo] of [
      [3, '2026-11-10'],
      [7, '2026-11-14'],
    ]) {
      const { html, controls } = renderControl({ settings: { ...settings, windowDays } })
      assert.match(html, /datetime="2026-11-08"/i)
      assert.ok(new RegExp(`datetime="${expectedTo}"`, 'i').test(html))
      assert.equal(windowSlider(controls).props.index, 7)
      const last = renderControl({
        settings: { ...settings, windowDays },
        date: windowDays === 3 ? '2026-11-28' : '2026-11-24',
        index: 30 - windowDays,
      })
      assert.match(last.html, /datetime="2026-11-30"/i)
      assert.ok(
        last.html.includes(
          windowDays === 3
            ? language === 'de'
              ? '28.11.2026'
              : '28/11/2026'
            : language === 'de'
              ? '24.11.2026'
              : '24/11/2026',
        ),
      )
    }
  })

  test(`playback-speed slider is labeled and gets faster to the right (${language})`, async () => {
    await i18n.changeLanguage(language)
    const { controls } = renderControl({}, [
      (controls) => settingsPopover(controls).props.onOpenChange(true),
    ])
    const speed = speedSlider(controls)
    assert.ok(speed)
    assert.equal(speed.props.min, 0.25)
    assert.equal(speed.props.max, 4)
    assert.equal(speed.props.step, 0.25)
    assert.equal(speed.props.value, 1)
    assert.equal(
      speed.props.ariaLabelForHandle,
      language === 'de' ? 'Wiedergabegeschwindigkeit' : 'Playback speed',
    )
    assert.equal(speed.props.marks[0.25], language === 'de' ? '0,25×' : '0.25×')
    assert.equal(speed.props.marks[1], '1×')
    assert.equal(speed.props.marks[4], '4×')
  })
}

test('opening settings pauses playback and only Apply publishes valid draft configuration', () => {
  const configured = []
  let paused = 0
  const { controls } = renderControl(
    { onPause: () => paused++, onConfigure: (value) => configured.push(value) },
    [
      (controls) => settingsPopover(controls).props.onOpenChange(true),
      (controls) =>
        rangePicker(controls).props.onChange([dayjs('2026-12-01'), dayjs('2026-12-31')]),
      (controls) => windowInput(controls).props.onChange(1000),
      (controls) => speedSlider(controls).props.onChange(2),
    ],
  )
  assert.equal(paused, 1)
  assert.deepEqual(configured, [])
  assert.equal(applyButton(controls).props.disabled, false)
  applyButton(controls).props.onClick()
  assert.deepEqual(configured, [
    { from: '2026-12-01', to: '2026-12-31', windowDays: 1000, playbackSpeed: 2 },
  ])
})

test('Cancel discards draft settings and reopening snapshots the currently applied configuration', () => {
  const configured = []
  const { controls } = renderControl({ onConfigure: (value) => configured.push(value) }, [
    (controls) => settingsPopover(controls).props.onOpenChange(true),
    (controls) => rangePicker(controls).props.onChange([dayjs('2026-12-01'), dayjs('2026-12-31')]),
    (controls) => windowInput(controls).props.onChange(500),
    (controls) => speedSlider(controls).props.onChange(3),
    (controls) => cancelButton(controls).props.onClick(),
    (controls) => settingsPopover(controls).props.onOpenChange(true),
  ])
  applyButton(controls).props.onClick()
  assert.deepEqual(configured, [settings])
})

test('missing/reversed date bounds and invalid window sizes cannot be applied', () => {
  for (const change of [
    (controls) => rangePicker(controls).props.onChange(null),
    (controls) => rangePicker(controls).props.onChange([dayjs('2026-11-01'), null]),
    (controls) => rangePicker(controls).props.onChange([dayjs('2026-12-01'), dayjs('2026-11-01')]),
    (controls) =>
      controls
        .find((control) => control.props.className === 'alert-timeline-window-input')
        .props.onChange(0),
    (controls) =>
      controls
        .find((control) => control.props.className === 'alert-timeline-window-input')
        .props.onChange(1.5),
    (controls) => windowInput(controls).props.onChange(Number.MAX_SAFE_INTEGER + 1),
    (controls) => speedSlider(controls).props.onChange(0),
    (controls) => speedSlider(controls).props.onChange(4.25),
  ]) {
    const configured = []
    const { controls } = renderControl({ onConfigure: (value) => configured.push(value) }, [
      (controls) => settingsPopover(controls).props.onOpenChange(true),
      change,
    ])
    assert.equal(applyButton(controls).props.disabled, true)
    applyButton(controls).props.onClick()
    assert.deepEqual(configured, [])
    assert.ok(controls.some((control) => control.props.role === 'alert'))
  }
})

test('single-date timelines keep seek/play unavailable without inventing another date', () => {
  const { controls } = renderControl({
    settings: { from: '2026-11-08', to: '2026-11-08', windowDays: 1, playbackSpeed: 1 },
    maxIndex: 0,
    index: 0,
  })
  assert.equal(named(controls, 'alerts.timeline.play').props.disabled, true)
  assert.equal(windowSlider(controls).props.index, 0)
  assert.equal(windowSlider(controls).props.settings.windowDays, 1)
})

test('window-slider pause requests reach the owning hook', () => {
  let paused = 0
  const { controls } = renderControl({ onPause: () => paused++ })
  windowSlider(controls).props.onPause()
  assert.equal(paused, 1)
})
