import {
  timelineDateAt,
  timelineIndexForDate,
  timelineMaxIndex,
  validateTimelineSettings,
  type TimelineSettings,
} from './alert-timeline-model.ts'

export interface AlertTimelineState {
  enabled: boolean
  playing: boolean
  index: number
  settings: TimelineSettings
}

export type AlertTimelineAction =
  | { type: 'enter'; settings: TimelineSettings }
  | { type: 'exit' | 'play' | 'pause' | 'tick' }
  | { type: 'seek'; index: number }
  | { type: 'configure'; settings: TimelineSettings }

export function reduceAlertTimeline(
  state: AlertTimelineState,
  action: AlertTimelineAction,
): AlertTimelineState {
  switch (action.type) {
    case 'enter':
      return validateTimelineSettings(action.settings)
        ? { enabled: true, playing: false, index: 0, settings: { ...action.settings } }
        : state
    case 'exit':
      return state.enabled || state.playing ? { ...state, enabled: false, playing: false } : state
    case 'pause':
      return state.playing ? { ...state, playing: false } : state
    case 'play': {
      const max = timelineMaxIndex(state.settings)
      return state.enabled && max > 0
        ? { ...state, playing: true, index: state.index >= max ? 0 : state.index }
        : state
    }
    case 'tick': {
      if (!state.enabled || !state.playing) {
        return state
      }
      const max = timelineMaxIndex(state.settings)
      const index = Math.min(state.index + 1, max)
      return { ...state, index, playing: index < max }
    }
    case 'seek':
      return {
        ...state,
        playing: false,
        index: timelineIndexForDate(state.settings, timelineDateAt(state.settings, action.index)),
      }
    case 'configure':
      return validateTimelineSettings(action.settings)
        ? {
            ...state,
            playing: false,
            settings: { ...action.settings },
            index: timelineIndexForDate(
              action.settings,
              timelineDateAt(state.settings, state.index),
            ),
          }
        : state
  }
}
