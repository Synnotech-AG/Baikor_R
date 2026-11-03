import assert from 'node:assert/strict'
import test from 'node:test'
import * as model from '../src/features/alerts/live/alert-timeline-model.ts'

const settings = { from: '2026-01-01', to: '2026-01-10', windowDays: 3, playbackSpeed: 1 }
const alert = (id, periods, extra = {}) => ({ id, periods, ...extra })
const ids = (alerts) => alerts.map((item) => item.id)

test('default dates use the civil day in Berlin across winter and summer UTC midnight', () => {
  assert.deepEqual(model.defaultTimelineSettings(new Date('2026-11-03T23:30:00Z')), {
    from: '2026-11-04',
    to: '2027-11-04',
    windowDays: 1,
    playbackSpeed: 1,
  })
  assert.deepEqual(model.defaultTimelineSettings(new Date('2026-06-03T22:30:00Z')), {
    from: '2026-06-04',
    to: '2027-06-04',
    windowDays: 1,
    playbackSpeed: 1,
  })
  assert.equal(model.defaultTimelineSettings(new Date('2026-11-03T22:59:59Z')).from, '2026-11-03')
  assert.equal(model.defaultTimelineSettings(new Date('2026-11-03T23:00:00Z')).from, '2026-11-04')
})

test('the default year ends on February 28 when today is leap day', () => {
  assert.deepEqual(model.defaultTimelineSettings(new Date('2024-02-28T23:30:00Z')), {
    from: '2024-02-29',
    to: '2025-02-28',
    windowDays: 1,
    playbackSpeed: 1,
  })
  const ordinary = model.defaultTimelineSettings(new Date('2023-03-01T12:00:00Z'))
  assert.equal(ordinary.to, '2024-03-01')
  assert.equal(model.timelineMaxIndex(ordinary), 366)
})

test('strict ISO validation accepts real Gregorian dates and positive whole-day window lengths', () => {
  for (const valid of [
    settings,
    { ...settings, windowDays: 366 },
    { ...settings, windowDays: 10_000 },
    { ...settings, windowDays: Number.MAX_SAFE_INTEGER },
    { from: '2024-02-29', to: '2024-02-29', windowDays: 365, playbackSpeed: 1 },
    { from: '0001-01-01', to: '9999-12-31', windowDays: 1, playbackSpeed: 1 },
    { from: '2000-02-29', to: '2000-03-01', windowDays: 2, playbackSpeed: 1 },
    { from: '0099-12-31', to: '0100-01-01', windowDays: 1, playbackSpeed: 1 },
  ]) {
    assert.equal(model.validateTimelineSettings(valid), true)
  }
  for (const invalidDate of [
    '',
    '2026-1-01',
    '2026-01-1',
    '2026-01-01T00:00:00Z',
    ' 2026-01-01',
    '2026-01-01 ',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
    '0000-01-01',
    '10000-01-01',
  ]) {
    assert.equal(
      model.validateTimelineSettings({ ...settings, from: invalidDate }),
      false,
      invalidDate,
    )
    assert.equal(
      model.validateTimelineSettings({ ...settings, to: invalidDate }),
      false,
      invalidDate,
    )
  }
  for (const windowDays of [
    0,
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    -Infinity,
    '1',
    null,
    undefined,
  ]) {
    assert.equal(model.validateTimelineSettings({ ...settings, windowDays }), false)
  }
  assert.equal(model.validateTimelineSettings({ ...settings, from: '2026-01-11' }), false)
})

test('playback speed accepts finite factors from one quarter through four and determines tick duration', () => {
  for (const playbackSpeed of [0.25, 0.3, 0.5, 1, 1.25, 2, 4]) {
    const configured = { ...settings, playbackSpeed }
    assert.equal(model.validateTimelineSettings(configured), true)
    assert.equal(model.timelinePlaybackInterval(configured), 1000 / playbackSpeed)
  }
  for (const playbackSpeed of [
    0,
    -1,
    0.249,
    4.001,
    NaN,
    Infinity,
    -Infinity,
    '1',
    null,
    undefined,
  ]) {
    const invalid = { ...settings, playbackSpeed }
    assert.equal(model.validateTimelineSettings(invalid), false)
    assert.throws(() => model.timelinePlaybackInterval(invalid), RangeError)
  }
  assert.equal(model.timelinePlaybackInterval({ ...settings, playbackSpeed: 0.25 }), 4000)
  assert.equal(model.timelinePlaybackInterval({ ...settings, playbackSpeed: 4 }), 250)
})

test('a ten-day window occupies one third of a thirty-day track at its first, middle and last positions', () => {
  const configured = { from: '2026-01-01', to: '2026-01-30', windowDays: 10, playbackSpeed: 1 }
  assert.equal(model.timelineDayCount?.(configured), 30)
  assert.equal(model.timelineDayCount?.({ ...configured, to: configured.from }), 1)
  assert.equal(model.timelineMaxIndex(configured), 20)
  for (const [index, from, to, start, end] of [
    [0, '2026-01-01', '2026-01-10', 0, 100 / 3],
    [10, '2026-01-11', '2026-01-20', 100 / 3, 200 / 3],
    [20, '2026-01-21', '2026-01-30', 200 / 3, 100],
  ]) {
    assert.deepEqual(model.timelineWindowAt(configured, index), { from, to })
    assert.equal(model.timelineDateAt(configured, index), from)
    assert.equal(model.timelineIndexForDate(configured, from), index)
    const position = model.timelineWindowPosition(configured, index)
    assert.equal(position.width, 100 / 3)
    assert.equal(position.start, start)
    assert.equal(position.end, end)
  }
  assert.deepEqual(
    model.timelineWindowPosition(configured, -10),
    model.timelineWindowPosition(configured, 0),
  )
  assert.deepEqual(
    model.timelineWindowPosition(configured, 100),
    model.timelineWindowPosition(configured, 20),
  )
})

test('a window longer than its range covers the entire track and cannot move', () => {
  const configured = {
    from: '2026-01-01',
    to: '2026-01-30',
    windowDays: Number.MAX_SAFE_INTEGER,
    playbackSpeed: 1,
  }
  assert.equal(model.validateTimelineSettings(configured), true)
  assert.equal(model.timelineMaxIndex(configured), 0)
  assert.equal(model.timelineDateAt(configured, 20), configured.from)
  assert.equal(model.timelineIndexForDate(configured, configured.to), 0)
  assert.deepEqual(model.timelineWindowAt(configured, 20), {
    from: configured.from,
    to: configured.to,
  })
  assert.deepEqual(model.timelineWindowPosition(configured, 20), { start: 0, end: 100, width: 100 })
})

test('daily cursor indices reach the last complete window without materializing dates', () => {
  assert.equal(model.timelineMaxIndex(settings), 7)
  assert.deepEqual(
    [0, 1, 6, 7, 9].map((index) => model.timelineDateAt(settings, index)),
    ['2026-01-01', '2026-01-02', '2026-01-07', '2026-01-08', '2026-01-08'],
  )
  const large = { from: '0001-01-01', to: '9999-12-31', windowDays: 1, playbackSpeed: 1 }
  const last = model.timelineMaxIndex(large)
  assert.equal(last, 3652058)
  assert.equal(model.timelineDateAt(large, last), large.to)
  assert.equal(model.timelineDateAt(large, 1), '0001-01-02')
})

test('window length limits the last cursor start while single-day ranges stay valid', () => {
  const exact = { from: '2026-01-01', to: '2026-01-11', windowDays: 5, playbackSpeed: 1 }
  assert.equal(model.timelineMaxIndex(exact), 6)
  assert.equal(model.timelineDateAt(exact, 10), '2026-01-07')
  const same = { from: '2026-01-01', to: '2026-01-01', windowDays: 5, playbackSpeed: 1 }
  assert.equal(model.timelineMaxIndex(same), 0)
  assert.equal(model.timelineDateAt(same, 10), same.to)
  assert.equal(model.timelineIndexForDate(same, '2027-01-01'), 0)
})

test('date indices clamp to the range and round fractional indices down', () => {
  for (const index of [-20, -0.5, NaN, Infinity, -Infinity]) {
    assert.equal(model.timelineDateAt(settings, index), settings.from)
  }
  assert.equal(model.timelineDateAt(settings, 1.9), '2026-01-02')
  assert.equal(model.timelineDateAt(settings, 999), '2026-01-08')
})

test('calendar steps stay consecutive through Berlin spring and autumn DST transitions', () => {
  for (const dates of [
    ['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01'],
    ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'],
    ['2024-02-28', '2024-02-29', '2024-03-01'],
  ]) {
    const range = { from: dates[0], to: dates.at(-1), windowDays: 1, playbackSpeed: 1 }
    assert.equal(model.timelineMaxIndex(range), dates.length - 1)
    assert.deepEqual(
      dates.map((_, index) => model.timelineDateAt(range, index)),
      dates,
    )
  }
})

test('each date maps to a daily cursor position clamped at the last complete window', () => {
  for (const [date, index] of [
    ['2025-12-31', 0],
    ['2026-01-01', 0],
    ['2026-01-04', 3],
    ['2026-01-05', 4],
    ['2026-01-08', 7],
    ['2026-01-09', 7],
    ['2026-01-10', 7],
    ['2027-01-01', 7],
  ]) {
    assert.equal(model.timelineIndexForDate(settings, date), index, date)
  }
  for (let index = 0; index <= model.timelineMaxIndex(settings); index++) {
    assert.equal(model.timelineIndexForDate(settings, model.timelineDateAt(settings, index)), index)
  }
})

test('invalid settings and invalid day arguments are rejected explicitly', () => {
  const invalid = { ...settings, windowDays: 0, playbackSpeed: 1 }
  assert.throws(() => model.timelineMaxIndex(invalid), RangeError)
  assert.throws(() => model.timelineDateAt(invalid, 0), RangeError)
  assert.throws(() => model.timelineWindowAt(invalid, 0), RangeError)
  assert.throws(() => model.timelineWindowPosition(invalid, 0), RangeError)
  assert.throws(() => model.timelinePlaybackInterval(invalid), RangeError)
  assert.throws(() => model.timelineIndexForDate(invalid, '2026-01-01'), RangeError)
  assert.throws(() => model.timelineIndexForDate(settings, '2026-02-30'), RangeError)
  assert.throws(() => model.filterAlertsForDay([], 'invalid'), RangeError)
  assert.throws(
    () => model.filterAlertsForWindow([], { from: '2026-01-02', to: '2026-01-01' }),
    RangeError,
  )
  assert.throws(
    () => model.filterAlertsForWindow([], { from: 'invalid', to: '2026-01-01' }),
    RangeError,
  )
  assert.throws(() => model.defaultTimelineSettings(new Date(NaN)), RangeError)
})

test('a null timeline day returns the original alert collection unchanged', () => {
  const alerts = Object.freeze([alert('superseded', [], { supersededByAlertId: 'current' })])
  assert.equal(model.filterAlertsForDay(alerts, null), alerts)
  assert.equal(model.filterAlertsForWindow(alerts, null), alerts)
})

test('a three-day window includes overlap in its middle and at either inclusive boundary', () => {
  const window = model.timelineWindowAt(settings, 2)
  assert.deepEqual(window, { from: '2026-01-03', to: '2026-01-05' })
  const alerts = [
    alert('before', [{ from: null, to: '2026-01-02' }]),
    alert('touch-start', [{ from: '2026-01-01', to: '2026-01-03' }]),
    alert('middle', [{ from: '2026-01-04', to: '2026-01-04' }]),
    alert('touch-end', [{ from: '2026-01-05', to: '2026-01-08' }]),
    alert('after', [{ from: '2026-01-06', to: null }]),
    alert('spanning', [{ from: '2026-01-01', to: '2026-01-10' }]),
  ]
  assert.deepEqual(ids(model.filterAlertsForWindow(alerts, window)), [
    'touch-start',
    'middle',
    'touch-end',
    'spanning',
  ])
})

test('a seven-day displayed window advances one calendar day for every cursor step', () => {
  const range = { from: '2026-01-01', to: '2026-01-20', windowDays: 7, playbackSpeed: 1 }
  assert.equal(model.timelineMaxIndex(range), 13)
  assert.equal(model.timelineDateAt(range, 1), '2026-01-02')
  assert.equal(model.timelineIndexForDate(range, '2026-01-03'), 2)
  assert.deepEqual(
    [0, 1, 2].map((index) => model.timelineWindowAt(range, index)),
    [
      { from: '2026-01-01', to: '2026-01-07' },
      { from: '2026-01-02', to: '2026-01-08' },
      { from: '2026-01-03', to: '2026-01-09' },
    ],
  )
})

test('displayed windows keep their length at the configured endpoint and clamp outside cursor indices', () => {
  assert.deepEqual(model.timelineWindowAt(settings, 8), { from: '2026-01-08', to: '2026-01-10' })
  assert.deepEqual(model.timelineWindowAt(settings, 9), { from: '2026-01-08', to: '2026-01-10' })
  assert.deepEqual(model.timelineWindowAt(settings, 999), { from: '2026-01-08', to: '2026-01-10' })
  assert.deepEqual(model.timelineWindowAt(settings, -1), { from: '2026-01-01', to: '2026-01-03' })
  assert.deepEqual(model.timelineWindowAt(settings, NaN), model.timelineWindowAt(settings, 0))
  const afterRange = alert('after-range', [{ from: '2026-01-11', to: null }])
  assert.deepEqual(
    model.filterAlertsForWindow([afterRange], model.timelineWindowAt(settings, 8)),
    [],
  )
})

test('multi-day windows use calendar arithmetic through DST, leap day and the final calendar bound', () => {
  for (const [from, to] of [
    ['2026-03-28', '2026-03-30'],
    ['2026-10-24', '2026-10-26'],
    ['2024-02-28', '2024-03-01'],
  ]) {
    assert.deepEqual(
      model.timelineWindowAt({ from, to: '2027-01-01', windowDays: 3, playbackSpeed: 1 }, 0),
      {
        from,
        to,
      },
    )
  }
  assert.deepEqual(
    model.timelineWindowAt(
      { from: '9999-12-30', to: '9999-12-31', windowDays: 365, playbackSpeed: 1 },
      0,
    ),
    {
      from: '9999-12-30',
      to: '9999-12-31',
    },
  )
})

test('window overlap respects disjoint gaps and ignores malformed intervals', () => {
  const disjoint = alert('disjoint', [
    { from: '2026-01-01', to: '2026-01-02' },
    { from: '2026-01-06', to: '2026-01-07' },
  ])
  const window = { from: '2026-01-03', to: '2026-01-05' }
  assert.deepEqual(model.filterAlertsForWindow([disjoint], window), [])
  assert.deepEqual(model.filterAlertsForWindow([disjoint], { ...window, to: '2026-01-06' }), [
    disjoint,
  ])
  assert.deepEqual(
    model.filterAlertsForWindow(
      [
        alert('inverted', [{ from: '2026-01-05', to: '2026-01-03' }]),
        alert('invalid', [{ from: '2026-02-30', to: null }]),
      ],
      window,
    ),
    [],
  )
})

test('window filtering preserves unknown periods and excludes superseded records without mutation', () => {
  const periods = Object.freeze([Object.freeze({ from: '2026-01-05', to: '2026-01-05' })])
  const matching = Object.freeze(
    alert('matching', periods, { condition: 'cleared', handling: 'handled' }),
  )
  const alerts = Object.freeze([
    matching,
    Object.freeze(alert('missing')),
    Object.freeze(alert('empty', [])),
    Object.freeze(alert('unbounded', [{ from: null, to: null }])),
    Object.freeze(alert('superseded', periods, { supersededByAlertId: 'current' })),
  ])
  const result = model.filterAlertsForWindow(alerts, { from: '2026-01-03', to: '2026-01-05' })
  assert.deepEqual(ids(result), ['matching', 'missing', 'empty', 'unbounded'])
  assert.equal(result[0], matching)
  assert.equal(result[0].periods, periods)
  assert.equal(alerts.length, 5)
})

test('period overlap includes both boundaries and keeps other alert state untouched', () => {
  const active = alert('active', [{ from: '2026-01-05', to: '2026-01-10' }], {
    condition: 'cleared',
    handling: 'handled',
  })
  for (const date of ['2026-01-05', '2026-01-07', '2026-01-10']) {
    assert.deepEqual(model.filterAlertsForDay([active], date), [active])
  }
  for (const date of ['2026-01-04', '2026-01-11']) {
    assert.deepEqual(model.filterAlertsForDay([active], date), [])
  }
})

test('one-sided and fully unbounded periods remain inclusive', () => {
  const alerts = [
    alert('until', [{ from: null, to: '2026-01-05' }]),
    alert('from', [{ from: '2026-01-05', to: null }]),
    alert('unbounded', [{ from: null, to: null }]),
  ]
  assert.deepEqual(ids(model.filterAlertsForDay(alerts, '2026-01-04')), ['until', 'unbounded'])
  assert.deepEqual(ids(model.filterAlertsForDay(alerts, '2026-01-05')), [
    'until',
    'from',
    'unbounded',
  ])
  assert.deepEqual(ids(model.filterAlertsForDay(alerts, '2026-01-06')), ['from', 'unbounded'])
})

test('disjoint periods preserve the gap instead of matching an enclosing range', () => {
  const item = alert('disjoint', [
    { from: '2026-01-01', to: '2026-01-02' },
    { from: '2026-01-10', to: '2026-01-11' },
  ])
  assert.deepEqual(model.filterAlertsForDay([item], '2026-01-06'), [])
  assert.deepEqual(model.filterAlertsForDay([item], '2026-01-10'), [item])
})

test('missing or empty periods are always visible while superseded alerts are excluded', () => {
  const alerts = [
    alert('missing'),
    alert('empty', []),
    alert('superseded', [], { supersededByAlertId: 'canonical' }),
    alert('ordinary', [], { supersededByAlertId: null }),
  ]
  assert.deepEqual(ids(model.filterAlertsForDay(alerts, '2026-01-06')), [
    'missing',
    'empty',
    'ordinary',
  ])
})

test('day filtering preserves order, object identities, periods and the original collection', () => {
  const periods = Object.freeze([Object.freeze({ from: '2026-01-01', to: '2026-01-10' })])
  const first = Object.freeze(alert('first', periods))
  const second = Object.freeze(alert('second', periods))
  const original = Object.freeze([first, second])
  const filtered = model.filterAlertsForDay(original, '2026-01-05')
  assert.deepEqual(filtered, original)
  assert.notEqual(filtered, original)
  assert.equal(filtered[0], first)
  assert.equal(filtered[1], second)
  assert.equal(filtered[0].periods, periods)
  assert.equal(original.length, 2)
})
