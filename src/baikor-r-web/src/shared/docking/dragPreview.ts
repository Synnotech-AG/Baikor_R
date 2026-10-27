import { calculateGeometry } from './geometry.ts'
import type { DockGeometry, DockRect, PanelMinimums } from './geometry.ts'
import { findDropTarget } from './interactions.ts'
import type { DropTarget, Point } from './interactions.ts'
import { dockPanel } from './layout.ts'
import type { DockLayout } from './layout.ts'

function hasVisiblePanel(geometry: DockGeometry, id: string): boolean {
  const rect = Object.hasOwn(geometry.panels, id) ? geometry.panels[id] : undefined
  return !!rect && rect.width > 0 && rect.height > 0
}

function contains(point: Point, rect: DockRect): boolean {
  return rect.width > 0 && rect.height > 0 && point.x >= rect.x && point.y >= rect.y
    && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height
}

function placeholderWithDivider(placeholder: DockRect, target: DockRect, edge: DropTarget['edge']): DockRect {
  switch (edge) {
    case 'left': return { ...placeholder, width: target.x - placeholder.x }
    case 'right': return { ...placeholder, x: target.x + target.width, width: placeholder.x + placeholder.width - (target.x + target.width) }
    case 'top': return { ...placeholder, height: target.y - placeholder.y }
    case 'bottom': return { ...placeholder, y: target.y + target.height, height: placeholder.y + placeholder.height - (target.y + target.height) }
  }
}

function sameTarget(first: DropTarget | null, second: DropTarget | null): boolean {
  return first?.panelId === second?.panelId && first?.edge === second?.edge
}

function retainsTarget(
  point: Point, preview: ReturnType<typeof calculateDragPreview>, target: DropTarget | null, committedTarget: DropTarget | null,
): boolean {
  if (!preview.placeholder || !target) return false
  if (sameTarget(target, committedTarget)) return true
  const retention = placeholderWithDivider(preview.placeholder, preview.geometry.panels[target.panelId], target.edge)
  return contains(point, retention)
}

export function calculateDragPreview(
  layout: DockLayout,
  size: { width: number; height: number },
  minimums: PanelMinimums,
  sourceId: string,
  target: DropTarget | null,
): { geometry: DockGeometry; placeholder: DockRect | null } {
  const committed = calculateGeometry(layout, size, minimums)
  if (!target || sourceId === target.panelId || !hasVisiblePanel(committed, sourceId) || !hasVisiblePanel(committed, target.panelId)) {
    return { geometry: committed, placeholder: null }
  }
  const projected = dockPanel(layout, sourceId, target.panelId, target.edge)
  if (projected === layout) return { geometry: committed, placeholder: null }
  const geometry = calculateGeometry(projected, size, minimums)
  return { geometry, placeholder: geometry.panels[sourceId] }
}

export function resolveDragTarget(
  point: Point,
  layout: DockLayout,
  size: { width: number; height: number },
  minimums: PanelMinimums,
  sourceId: string,
  previousTarget: DropTarget | null,
): DropTarget | null {
  if (!contains(point, { x: 0, y: 0, ...size })) return null
  const committed = calculateGeometry(layout, size, minimums)
  if (!hasVisiblePanel(committed, sourceId)) return null
  const committedTarget = findDropTarget(point, committed.panels, sourceId)
  const preview = previousTarget ? calculateDragPreview(layout, size, minimums, sourceId, previousTarget) : { geometry: committed, placeholder: null }
  if (retainsTarget(point, preview, previousTarget, committedTarget)) return previousTarget
  const candidate = findDropTarget(point, preview.geometry.panels, sourceId)
  if (!candidate || sameTarget(candidate, committedTarget)) return committedTarget
  if (sameTarget(candidate, previousTarget)) return candidate

  // A projected edge must survive its own reflow so release at the same point keeps the advertised drop.
  const candidatePreview = calculateDragPreview(layout, size, minimums, sourceId, candidate)
  if (retainsTarget(point, candidatePreview, candidate, committedTarget)
    || sameTarget(findDropTarget(point, candidatePreview.geometry.panels, sourceId), candidate)) return candidate
  return committedTarget
}

export function floatingPanelRect(origin: DockRect, start: Point, point: Point): DockRect {
  return { ...origin, x: origin.x + (point.x - start.x), y: origin.y + (point.y - start.y) }
}
