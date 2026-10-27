import type { DockEdge } from './layout'
import type { DockRect } from './geometry'

export interface DropTarget { panelId: string; edge: DockEdge }
export interface Point { x: number; y: number }

export function findDropTarget(point: Point, panels: Record<string, DockRect>, sourceId: string): DropTarget | null {
  for (const [panelId, rect] of Object.entries(panels)) {
    if (panelId === sourceId || rect.width <= 0 || rect.height <= 0 || point.x < rect.x || point.y < rect.y
      || point.x > rect.x + rect.width || point.y > rect.y + rect.height) continue
    const horizontalZone = Math.min(80, rect.width * 0.3)
    const verticalZone = Math.min(80, rect.height * 0.3)
    const distances: [DockEdge, number][] = [
      ['left', (point.x - rect.x) / horizontalZone], ['right', (rect.x + rect.width - point.x) / horizontalZone],
      ['top', (point.y - rect.y) / verticalZone], ['bottom', (rect.y + rect.height - point.y) / verticalZone],
    ]
    const [edge, distance] = distances.sort((a, b) => a[1] - b[1])[0]
    return distance <= 1 ? { panelId, edge } : null
  }
  return null
}

export function resizedRatio(start: number, delta: number, available: number, min: number, max: number) {
  const next = available > 0 && Number.isFinite(delta) ? start + delta / available : start
  return Math.max(min, Math.min(max, next))
}
