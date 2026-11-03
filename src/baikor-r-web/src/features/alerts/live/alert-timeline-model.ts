import type { AlertSummary } from '../types'

export interface TimelineSettings {
  from: string
  to: string
  windowDays: number
  playbackSpeed: number
}

export interface TimelineWindow {
  from: string
  to: string
}

const millisecondsPerDay = 86_400_000
const berlinDate = new Intl.DateTimeFormat('en', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function dayOrdinal(value: string): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    return null
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null
  }
  return date.getTime() / millisecondsPerDay
}

function bounds(settings: TimelineSettings) {
  if (!settings) {
    return null
  }
  const from = dayOrdinal(settings.from)
  const to = dayOrdinal(settings.to)
  if (
    from === null ||
    to === null ||
    from > to ||
    !Number.isSafeInteger(settings.windowDays) ||
    settings.windowDays < 1 ||
    !Number.isFinite(settings.playbackSpeed) ||
    settings.playbackSpeed < 0.25 ||
    settings.playbackSpeed > 4
  ) {
    return null
  }
  const totalDays = to - from + 1
  return {
    from,
    to,
    totalDays,
    effectiveWindowDays: Math.min(settings.windowDays, totalDays),
    playbackSpeed: settings.playbackSpeed,
  }
}

function requireBounds(settings: TimelineSettings) {
  const valid = bounds(settings)
  if (!valid) {
    throw new RangeError('Invalid timeline settings.')
  }
  return valid
}

export function defaultTimelineSettings(now: Date = new Date()): TimelineSettings {
  const parts = berlinDate.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  const from = `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`
  const toYear = String(Number(part('year')) + 1).padStart(4, '0')
  const toDay = from.endsWith('-02-29') ? '28' : part('day')
  const settings = {
    from,
    to: `${toYear}-${part('month')}-${toDay}`,
    windowDays: 1,
    playbackSpeed: 1,
  }
  if (!validateTimelineSettings(settings)) {
    throw new RangeError('The current date is outside the timeline calendar.')
  }
  return settings
}

export function validateTimelineSettings(settings: TimelineSettings): boolean {
  return bounds(settings) !== null
}

export function timelineDayCount(settings: TimelineSettings): number {
  return requireBounds(settings).totalDays
}

export function timelineMaxIndex(settings: TimelineSettings): number {
  const { totalDays, effectiveWindowDays } = requireBounds(settings)
  return totalDays - effectiveWindowDays
}

function boundedIndex(index: number, maximum: number): number {
  return Number.isFinite(index) ? Math.max(0, Math.min(maximum, Math.floor(index))) : 0
}

function dateAtOrdinal(day: number): string {
  return new Date(day * millisecondsPerDay).toISOString().slice(0, 10)
}

export function timelineDateAt(settings: TimelineSettings, index: number): string {
  const { from, totalDays, effectiveWindowDays } = requireBounds(settings)
  return dateAtOrdinal(from + boundedIndex(index, totalDays - effectiveWindowDays))
}

export function timelineWindowAt(settings: TimelineSettings, index: number): TimelineWindow {
  const { from, totalDays, effectiveWindowDays } = requireBounds(settings)
  const cursor = from + boundedIndex(index, totalDays - effectiveWindowDays)
  return {
    from: dateAtOrdinal(cursor),
    to: dateAtOrdinal(cursor + effectiveWindowDays - 1),
  }
}

export function timelineWindowPosition(
  settings: TimelineSettings,
  index: number,
): { start: number; end: number; width: number } {
  const { totalDays, effectiveWindowDays } = requireBounds(settings)
  const cursor = boundedIndex(index, totalDays - effectiveWindowDays)
  return {
    start: (100 * cursor) / totalDays,
    end: (100 * (cursor + effectiveWindowDays)) / totalDays,
    width: (100 * effectiveWindowDays) / totalDays,
  }
}

export function timelinePlaybackInterval(settings: TimelineSettings): number {
  return 1000 / requireBounds(settings).playbackSpeed
}

export function timelineIndexForDate(settings: TimelineSettings, date: string): number {
  const { from, totalDays, effectiveWindowDays } = requireBounds(settings)
  const day = dayOrdinal(date)
  if (day === null) {
    throw new RangeError('Invalid timeline date.')
  }
  return Math.max(0, Math.min(totalDays - effectiveWindowDays, day - from))
}

export function filterAlertsForWindow(
  alerts: readonly AlertSummary[],
  window: TimelineWindow | null,
): readonly AlertSummary[] {
  if (window === null) {
    return alerts
  }
  const windowFrom = dayOrdinal(window.from)
  const windowTo = dayOrdinal(window.to)
  if (windowFrom === null || windowTo === null || windowFrom > windowTo) {
    throw new RangeError('Invalid timeline window.')
  }
  return alerts.filter((alert) => {
    if (alert.supersededByAlertId) {
      return false
    }
    if (!alert.periods?.length) {
      return true
    }
    return alert.periods.some((period) => {
      const from = period.from === null ? -Infinity : dayOrdinal(period.from)
      const to = period.to === null ? Infinity : dayOrdinal(period.to)
      return from !== null && to !== null && from <= to && from <= windowTo && to >= windowFrom
    })
  })
}

export function filterAlertsForDay(
  alerts: readonly AlertSummary[],
  date: string | null,
): readonly AlertSummary[] {
  return filterAlertsForWindow(alerts, date === null ? null : { from: date, to: date })
}
