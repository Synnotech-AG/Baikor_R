import {
  CloseOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  PlayCircleFilled,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, DatePicker, InputNumber, Popover, Slider, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../shared/formatters'
import { timelineWindowAt, validateTimelineSettings } from './alert-timeline-model'
import type { TimelineSettings } from './alert-timeline-model'
import { AlertTimelineWindowSlider } from './alert-timeline-window-slider'
import './alert-timeline-control.css'

export interface AlertTimelineControlProps {
  enabled: boolean
  playing: boolean
  date: string
  settings: TimelineSettings
  index: number
  maxIndex: number
  count?: number
  onEnter: () => void
  onExit: () => void
  onTogglePlaying: () => void
  onSeek: (index: number) => void
  onConfigure: (settings: TimelineSettings) => void
  onPause?: () => void
}

export function AlertTimelineControl({
  enabled,
  playing,
  date,
  settings,
  index,
  maxIndex,
  count,
  onEnter,
  onExit,
  onTogglePlaying,
  onSeek,
  onConfigure,
  onPause,
}: AlertTimelineControlProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState(settings)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const fieldId = useId()
  const draftValid = validateTimelineSettings(draft)
  const displayDate = (value: string) =>
    value && dayjs(value).isValid() ? formatDate(value, locale) : '–'
  const speedLabel = (value = 1) =>
    t('alerts.timeline.speedValue', {
      speed: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value),
    })
  const changeSettingsOpen = (open: boolean) => {
    if (open) {
      onPause?.()
      setDraft(settings)
    }
    setSettingsOpen(open)
  }
  const dismissSettings = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setSettingsOpen(false)
      settingsButtonRef.current?.focus()
    }
  }

  if (!enabled) {
    return (
      <Button
        className="alert-timeline-enter"
        icon={<PlayCircleOutlined aria-hidden />}
        aria-label={t('alerts.timeline.enter')}
        onClick={onEnter}
      >
        {t('alerts.timeline.enter')}
      </Button>
    )
  }

  const window = timelineWindowAt(settings, index)
  const hasWindowRange = window.from !== window.to

  return (
    <section className="alert-timeline-control" aria-label={t('alerts.timeline.title')}>
      <div className="alert-timeline-header">
        <div className="alert-timeline-date">
          <div className="alert-timeline-caption">
            <span>{t('alerts.timeline.title')}</span>
            {count !== undefined && <span>{t('alerts.timeline.count', { count })}</span>}
          </div>
          <div
            className="alert-timeline-date-value"
            aria-label={t(hasWindowRange ? 'alerts.timeline.range' : 'alerts.timeline.date')}
          >
            <time dateTime={date}>{displayDate(window.from)}</time>
            {hasWindowRange && (
              <>
                <span aria-hidden> – </span>
                <time dateTime={window.to}>{displayDate(window.to)}</time>
              </>
            )}
          </div>
        </div>
        <div className="alert-timeline-actions">
          <Tooltip title={t(playing ? 'alerts.timeline.pause' : 'alerts.timeline.play')}>
            <Button
              type="text"
              icon={playing ? <PauseOutlined aria-hidden /> : <PlayCircleFilled aria-hidden />}
              aria-label={t(playing ? 'alerts.timeline.pause' : 'alerts.timeline.play')}
              disabled={maxIndex <= 0}
              onClick={() => {
                if (maxIndex > 0) {
                  onTogglePlaying()
                }
              }}
            />
          </Tooltip>
          <Popover
            trigger="click"
            placement="topRight"
            open={settingsOpen}
            onOpenChange={changeSettingsOpen}
            destroyOnHidden
            content={
              <section
                className="alert-timeline-settings"
                aria-label={t('alerts.timeline.settings')}
                onKeyDown={dismissSettings}
              >
                <strong>{t('alerts.timeline.settings')}</strong>
                <div className="alert-timeline-setting-field">
                  <span>{t('alerts.timeline.range')}</span>
                  <label className="alert-timeline-sr-only" htmlFor={`${fieldId}-from`}>
                    {t('alerts.timeline.from')}
                  </label>
                  <label className="alert-timeline-sr-only" htmlFor={`${fieldId}-to`}>
                    {t('alerts.timeline.to')}
                  </label>
                  <DatePicker.RangePicker
                    id={{ start: `${fieldId}-from`, end: `${fieldId}-to` }}
                    value={[
                      draft.from ? dayjs(draft.from) : null,
                      draft.to ? dayjs(draft.to) : null,
                    ]}
                    allowEmpty={[true, true]}
                    order={false}
                    format="DD.MM.YYYY"
                    placeholder={[t('alerts.timeline.from'), t('alerts.timeline.to')]}
                    onChange={(dates) =>
                      setDraft((current) => ({
                        ...current,
                        from: dates?.[0]?.format('YYYY-MM-DD') ?? '',
                        to: dates?.[1]?.format('YYYY-MM-DD') ?? '',
                      }))
                    }
                  />
                </div>
                <div className="alert-timeline-setting-field">
                  <label htmlFor={`${fieldId}-window`}>{t('alerts.timeline.window')}</label>
                  <InputNumber
                    className="alert-timeline-window-input"
                    id={`${fieldId}-window`}
                    aria-label={t('alerts.timeline.window')}
                    min={1}
                    precision={0}
                    suffix={t('alerts.timeline.days', { count: draft.windowDays })}
                    value={Number.isFinite(draft.windowDays) ? draft.windowDays : null}
                    onChange={(windowDays) =>
                      setDraft((current) => ({ ...current, windowDays: windowDays ?? Number.NaN }))
                    }
                  />
                </div>
                <div className="alert-timeline-setting-field">
                  <label className="alert-timeline-speed-label" htmlFor={`${fieldId}-speed`}>
                    <span>{t('alerts.timeline.playbackSpeed')}</span>
                    <span>{speedLabel(draft.playbackSpeed)}</span>
                  </label>
                  <Slider
                    className="alert-timeline-speed-slider"
                    id={`${fieldId}-speed`}
                    min={0.25}
                    max={4}
                    step={0.25}
                    value={draft.playbackSpeed}
                    marks={{ 0.25: speedLabel(0.25), 1: speedLabel(1), 4: speedLabel(4) }}
                    ariaLabelForHandle={t('alerts.timeline.playbackSpeed')}
                    ariaValueTextFormatterForHandle={speedLabel}
                    tooltip={{ formatter: speedLabel }}
                    onChange={(playbackSpeed) =>
                      setDraft((current) => ({ ...current, playbackSpeed }))
                    }
                  />
                </div>
                {!draftValid && (
                  <p className="alert-timeline-validation" role="alert">
                    {t('alerts.timeline.invalid')}
                  </p>
                )}
                <footer className="alert-timeline-settings-actions">
                  <Button onClick={() => changeSettingsOpen(false)}>
                    {t('alerts.timeline.cancel')}
                  </Button>
                  <Button
                    type="primary"
                    disabled={!draftValid}
                    onClick={() => {
                      if (draftValid) {
                        onConfigure(draft)
                        changeSettingsOpen(false)
                      }
                    }}
                  >
                    {t('alerts.timeline.apply')}
                  </Button>
                </footer>
              </section>
            }
          >
            <Tooltip title={t('alerts.timeline.settings')}>
              <Button
                ref={settingsButtonRef}
                type="text"
                icon={<SettingOutlined aria-hidden />}
                aria-label={t('alerts.timeline.settings')}
                aria-expanded={settingsOpen}
                onKeyDown={dismissSettings}
              />
            </Tooltip>
          </Popover>
          <Tooltip title={t('alerts.timeline.exit')}>
            <Button
              type="text"
              icon={<CloseOutlined aria-hidden />}
              aria-label={t('alerts.timeline.exit')}
              onClick={() => {
                setSettingsOpen(false)
                onExit()
              }}
            />
          </Tooltip>
        </div>
      </div>
      <AlertTimelineWindowSlider
        settings={settings}
        index={index}
        onSeek={onSeek}
        onPause={onPause}
      />
    </section>
  )
}
