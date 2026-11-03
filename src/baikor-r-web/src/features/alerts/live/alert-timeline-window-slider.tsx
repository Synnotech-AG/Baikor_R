import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../shared/formatters'
import {
  timelineMaxIndex,
  timelineWindowAt,
  timelineWindowPosition,
  type TimelineSettings,
} from './alert-timeline-model'
import { timelineIndexAtPointer, timelineKeyboardIndex } from './alert-timeline-slider-model'
import './alert-timeline-window-slider.css'

interface AlertTimelineWindowSliderProps {
  settings: TimelineSettings
  index: number
  onSeek: (index: number) => void
  onPause?: () => void
}

export function AlertTimelineWindowSlider({
  settings,
  index,
  onSeek,
  onPause,
}: AlertTimelineWindowSliderProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; fraction: number; lastIndex: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const maxIndex = timelineMaxIndex(settings)
  const currentIndex = Math.max(
    0,
    Math.min(maxIndex, Number.isFinite(index) ? Math.floor(index) : 0),
  )
  const position = timelineWindowPosition(settings, currentIndex)
  const range = timelineWindowAt(settings, currentIndex)
  const from = formatDate(range.from, locale)
  const to = formatDate(range.to, locale)

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const bounds = trackRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !bounds) {
      return
    }
    const next = timelineIndexAtPointer(settings, bounds, event.clientX, drag.fraction)
    if (next !== null && next !== drag.lastIndex) {
      drag.lastIndex = next
      onSeek(next)
    }
  }

  const start = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = trackRef.current?.getBoundingClientRect()
    if (
      maxIndex === 0 ||
      event.button !== 0 ||
      event.isPrimary === false ||
      !bounds ||
      bounds.width <= 0
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onPause?.()
    thumbRef.current?.focus({ preventScroll: true })
    const onThumb = thumbRef.current?.contains(event.target as Node)
    const thumbWidth = (position.width / 100) * bounds.width
    const fraction =
      onThumb && thumbWidth > 0
        ? (event.clientX - bounds.left - (position.start / 100) * bounds.width) / thumbWidth
        : 0.5
    dragRef.current = { pointerId: event.pointerId, fraction, lastIndex: currentIndex }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    if (!onThumb) {
      move(event)
    }
  }

  const finish = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }
    if (commit) {
      move(event)
    }
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (maxIndex === 0) {
      return
    }
    const next = timelineKeyboardIndex(settings, currentIndex, event.key)
    if (next !== null) {
      event.preventDefault()
      event.stopPropagation()
      onPause?.()
      onSeek(next)
    }
  }

  return (
    <div className={`alert-timeline-window-slider${dragging ? ' is-dragging' : ''}`}>
      <div
        ref={trackRef}
        className="alert-timeline-window-track"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={(event) => finish(event, true)}
        onPointerCancel={(event) => finish(event, false)}
        onLostPointerCapture={(event) => finish(event, false)}
      >
        <div
          ref={thumbRef}
          className="alert-timeline-window-thumb"
          role="slider"
          tabIndex={maxIndex > 0 ? 0 : -1}
          aria-label={t('alerts.timeline.slider')}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={currentIndex}
          aria-valuetext={from === to ? from : `${from} – ${to}`}
          aria-disabled={maxIndex === 0}
          style={{ left: `${position.start}%`, width: `${position.width}%` }}
          onKeyDown={navigate}
        >
          <span className="alert-timeline-window-grip" aria-hidden />
        </div>
      </div>
      <div className="alert-timeline-window-bounds" aria-hidden>
        <span>{formatDate(settings.from, locale)}</span>
        <span>{formatDate(settings.to, locale)}</span>
      </div>
    </div>
  )
}
