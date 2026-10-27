import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent, MouseEvent, RefObject } from 'react'
import type { DockRect } from './geometry'
import { advancePanelDrag, consumeDragEscape } from './dragSession'
import type { DropTargetResolver, PanelDrag } from './dragSession'
import { findDropTarget } from './interactions'
import type { DropTarget, Point } from './interactions'

export type { PanelDrag } from './dragSession'
interface PointerDrag { session: PanelDrag; handle: HTMLButtonElement; geometrySignature: string }

export function usePanelDrag(
  host: RefObject<HTMLDivElement | null>, panels: Record<string, DockRect>, enabled: boolean,
  onDrop: (sourceId: string, target: DropTarget) => void, resolveTarget?: DropTargetResolver,
) {
  const [drag, setDrag] = useState<PanelDrag | null>(null)
  const pointer = useRef<PointerDrag | null>(null)
  const suppressClick = useRef(false)
  const active = drag !== null
  const geometrySignature = JSON.stringify(panels)
  const cancel = useCallback(() => {
    const current = pointer.current
    if (current?.session.started) suppressClick.current = true
    pointer.current = null
    setDrag(null)
    if (current?.handle.hasPointerCapture(current.session.pointerId)) current.handle.releasePointerCapture(current.session.pointerId)
  }, [])
  useEffect(() => {
    if (!active) return
    const key = (event: globalThis.KeyboardEvent) => consumeDragEscape(event, cancel)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', cancel)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('blur', cancel) }
  }, [active, cancel])
  useEffect(() => {
    const current = pointer.current
    if (current && (!enabled || current.geometrySignature !== geometrySignature)) cancel()
  }, [enabled, geometrySignature, cancel])

  const pointFor = (event: PointerEvent<HTMLButtonElement>): Point => {
    const rect = host.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.x ?? 0), y: event.clientY - (rect?.y ?? 0) }
  }
  const resolve: DropTargetResolver = resolveTarget ?? ((point, sourceId) => findDropTarget(point, panels, sourceId))
  const cancelPointer = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current?.session.pointerId === event.pointerId) cancel()
  }
  return {
    drag,
    eventsFor: (sourceId: string) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!enabled || event.button !== 0 || !event.isPrimary || pointer.current || !panels[sourceId]) return
        suppressClick.current = false
        const point = pointFor(event)
        const session: PanelDrag = {
          sourceId, origin: { ...panels[sourceId] }, point, start: point, target: null,
          started: false, pointerId: event.pointerId,
        }
        pointer.current = { session, handle: event.currentTarget, geometrySignature }
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrag(session)
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const current = pointer.current
        if (!current) return
        const next = advancePanelDrag(current.session, pointFor(event), event.pointerId, resolve)
        if (next === current.session) return
        current.session = next
        setDrag(next)
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        const current = pointer.current
        if (!current || current.session.pointerId !== event.pointerId) return
        const finished = advancePanelDrag(current.session, pointFor(event), event.pointerId, resolve)
        current.session = finished
        cancel()
        if (finished.started && finished.target) onDrop(finished.sourceId, finished.target)
      },
      onPointerCancel: cancelPointer,
      onLostPointerCapture: cancelPointer,
      onClickCapture: (event: MouseEvent<HTMLButtonElement>) => {
        if (suppressClick.current && event.detail > 0) {
          suppressClick.current = false
          event.preventDefault()
          event.stopPropagation()
        }
      },
    }),
  }
}
