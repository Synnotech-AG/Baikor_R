import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { calculateGeometry } from './geometry'
import { resizedRatio } from './interactions'

type Split = ReturnType<typeof calculateGeometry>['splits'][number]
interface SplitHandleProps { split: Split; onChange: (ratio: number, commit: boolean) => void; onCommit: () => void }

export function SplitHandle({ split, onChange, onCommit }: SplitHandleProps) {
  const { t } = useTranslation()
  const start = useRef<{ position: number; ratio: number } | null>(null)
  const horizontal = split.axis === 'horizontal'
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    start.current = null
    onCommit()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const negative = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const positive = horizontal ? 'ArrowRight' : 'ArrowDown'
    if (![negative, positive, 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const value = event.key === 'Home' ? split.minRatio : event.key === 'End' ? split.maxRatio
      : resizedRatio(split.ratio, (event.key === negative ? -1 : 1) * (event.shiftKey ? 60 : 24), split.available, split.minRatio, split.maxRatio)
    onChange(value, true)
  }
  return <div className={`docking-split docking-split-${split.axis}`} style={{ left: split.rect.x, top: split.rect.y, width: split.rect.width, height: split.rect.height }}
    role="separator" tabIndex={0} aria-label={t('dock.resize')} aria-orientation={horizontal ? 'vertical' : 'horizontal'}
    aria-valuemin={Math.round(split.minRatio * 100)} aria-valuemax={Math.round(split.maxRatio * 100)} aria-valuenow={Math.round(split.ratio * 100)}
    title={t('dock.resizeHint')} onKeyDown={keyDown} onDoubleClick={() => onChange(0.5, true)}
    onPointerDown={(event) => {
      if (event.button !== 0) return
      event.preventDefault()
      start.current = { position: horizontal ? event.clientX : event.clientY, ratio: split.ratio }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={(event) => {
      if (!start.current) return
      onChange(resizedRatio(start.current.ratio, (horizontal ? event.clientX : event.clientY) - start.current.position,
        split.available, split.minRatio, split.maxRatio), false)
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
}
