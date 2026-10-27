import type { DockRect } from './geometry'
import type { DropTarget, Point } from './interactions'

export interface PanelDrag {
  sourceId: string
  origin: DockRect
  start: Point
  point: Point
  pointerId: number
  started: boolean
  target: DropTarget | null
}

export type DropTargetResolver = (point: Point, sourceId: string, previousTarget: DropTarget | null) => DropTarget | null

export function advancePanelDrag(drag: PanelDrag, point: Point, pointerId: number, resolve: DropTargetResolver): PanelDrag {
  if (pointerId !== drag.pointerId) return drag
  const started = drag.started || Math.hypot(point.x - drag.start.x, point.y - drag.start.y) >= 8
  if (!started) return drag
  return { ...drag, point, started, target: resolve(point, drag.sourceId, drag.target) }
}

export function consumeDragEscape(event: Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopImmediatePropagation'>, cancel: () => void): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopImmediatePropagation()
  cancel()
}
