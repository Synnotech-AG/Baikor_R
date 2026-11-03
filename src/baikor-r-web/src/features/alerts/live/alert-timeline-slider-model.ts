import {
  timelineDayCount,
  timelineMaxIndex,
  timelineWindowPosition,
  type TimelineSettings,
} from './alert-timeline-model.ts'

export function timelineIndexAtPointer(
  settings: TimelineSettings,
  bounds: { left: number; width: number },
  clientX: number,
  grabFraction = 0.5,
): number | null {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.width) ||
    bounds.width <= 0
  ) {
    return null
  }
  const totalDays = timelineDayCount(settings)
  const windowDays = (timelineWindowPosition(settings, 0).width / 100) * totalDays
  // The enlarged hit target can be grabbed outside the visible window.
  const grab = Number.isFinite(grabFraction) ? grabFraction : 0.5
  const index = Math.round(((clientX - bounds.left) / bounds.width) * totalDays - windowDays * grab)
  return Math.min(timelineMaxIndex(settings), Math.max(0, index))
}

export function timelineKeyboardIndex(settings: TimelineSettings, index: number, key: string) {
  const max = timelineMaxIndex(settings)
  const current = Number.isFinite(index) ? Math.min(max, Math.max(0, Math.round(index))) : 0
  const changes: Record<string, number> = {
    ArrowRight: 1,
    ArrowUp: 1,
    ArrowLeft: -1,
    ArrowDown: -1,
    PageUp: 7,
    PageDown: -7,
  }
  if (key === 'Home') {
    return 0
  }
  if (key === 'End') {
    return max
  }
  return Object.hasOwn(changes, key) ? Math.min(max, Math.max(0, current + changes[key])) : null
}
