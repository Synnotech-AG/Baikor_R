import { useCallback, useEffect, useMemo, useReducer, type RefObject } from 'react'
import {
  defaultTimelineSettings,
  timelineWindowAt,
  timelineMaxIndex,
  timelinePlaybackInterval,
  type TimelineSettings,
} from './alert-timeline-model'
import { reduceAlertTimeline } from './alert-timeline-state'

interface UseAlertTimelineOptions {
  available: boolean
  mapElementRef: RefObject<HTMLElement | null>
}

export function useAlertTimeline({ available, mapElementRef }: UseAlertTimelineOptions) {
  const [state, dispatch] = useReducer(reduceAlertTimeline, undefined, () => ({
    enabled: false,
    playing: false,
    index: 0,
    settings: defaultTimelineSettings(),
  }))
  const pause = useCallback(() => dispatch({ type: 'pause' }), [])
  const exit = useCallback(() => dispatch({ type: 'exit' }), [])
  const enter = useCallback(() => {
    if (available) {
      dispatch({ type: 'enter', settings: defaultTimelineSettings() })
    }
  }, [available])
  const togglePlaying = useCallback(() => {
    dispatch({ type: available && !document.hidden && !state.playing ? 'play' : 'pause' })
  }, [available, state.playing])
  const seek = useCallback((index: number) => dispatch({ type: 'seek', index }), [])
  const configure = useCallback(
    (settings: TimelineSettings) => dispatch({ type: 'configure', settings }),
    [],
  )

  const playbackInterval = timelinePlaybackInterval(state.settings)
  useEffect(() => {
    if (!available) {
      exit()
    }
  }, [available, exit])

  useEffect(() => {
    if (!available || !state.enabled || !state.playing) {
      return
    }
    const timer = window.setInterval(() => dispatch({ type: 'tick' }), playbackInterval)
    return () => window.clearInterval(timer)
  }, [available, state.enabled, state.playing, playbackInterval])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        pause()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    const element = mapElementRef.current
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect
      if (bounds && (bounds.width === 0 || bounds.height === 0)) {
        pause()
      }
    })
    if (element) {
      observer.observe(element)
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      observer.disconnect()
    }
  }, [available, mapElementRef, pause])

  const { from, to } = timelineWindowAt(state.settings, state.index)
  const displayWindow = useMemo(() => ({ from, to }), [from, to])

  return {
    enabled: available && state.enabled,
    playing: available && state.playing,
    date: displayWindow.from,
    window: displayWindow,
    index: state.index,
    maxIndex: timelineMaxIndex(state.settings),
    settings: state.settings,
    enter,
    exit,
    pause,
    togglePlaying,
    seek,
    configure,
  }
}
