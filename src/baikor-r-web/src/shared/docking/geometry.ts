import type { DockAxis, DockLayout, DockNode } from './layout.ts'

export interface DockRect { x: number; y: number; width: number; height: number }
export type PanelMinimums = Record<string, { minWidth: number; minHeight: number }>
export interface DockSplitGeometry {
  id: string
  axis: DockAxis
  rect: DockRect
  available: number
  ratio: number
  minRatio: number
  maxRatio: number
}
export interface DockGeometry {
  panels: Record<string, DockRect>
  splits: DockSplitGeometry[]
}

const dimension = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
const minimumSum = (first: number, second: number, gap: number) => Math.min(Number.MAX_VALUE, first + second + gap)

function ratioBounds(available: number, first: number, second: number): { minRatio: number; maxRatio: number } {
  if (available === 0) return { minRatio: 0.5, maxRatio: 0.5 }
  // When the viewport cannot fit both minima, reduce them proportionally while
  // retaining room to resize. No child is allowed to overflow its parent.
  if (first + second > available) {
    const largest = Math.max(first, second)
    const firstShare = (first / largest) / (first / largest + second / largest)
    return { minRatio: firstShare * 0.8, maxRatio: 1 - (1 - firstShare) * 0.8 }
  }
  return { minRatio: first / available, maxRatio: 1 - second / available }
}

export function calculateGeometry(layout: DockLayout, size: { width: number; height: number }, panelMinimums: PanelMinimums, divider = 10): DockGeometry {
  const result: DockGeometry = { panels: {}, splits: [] }
  const hidden = new Set(layout.collapsed)
  const minimums = new WeakMap<DockNode, { width: number; height: number } | null>()
  const gap = dimension(divider)

  function measure(node: DockNode): { width: number; height: number } | null {
    if (minimums.has(node)) return minimums.get(node)!
    let minimum: { width: number; height: number } | null
    if (node.kind === 'panel') {
      minimum = hidden.has(node.id) ? null : { width: dimension(panelMinimums[node.id]?.minWidth), height: dimension(panelMinimums[node.id]?.minHeight) }
    } else {
      const first = measure(node.first)
      const second = measure(node.second)
      minimum = !first ? second : !second ? first : node.axis === 'horizontal'
        ? { width: minimumSum(first.width, second.width, gap), height: Math.max(first.height, second.height) }
        : { width: Math.max(first.width, second.width), height: minimumSum(first.height, second.height, gap) }
    }
    minimums.set(node, minimum)
    return minimum
  }

  function place(node: DockNode, rect: DockRect): void {
    if (!measure(node)) return
    if (node.kind === 'panel') {
      Object.defineProperty(result.panels, node.id, { value: rect, enumerable: true, configurable: true, writable: true })
      return
    }
    const first = measure(node.first)
    const second = measure(node.second)
    if (!first) return place(node.second, rect)
    if (!second) return place(node.first, rect)
    const horizontal = node.axis === 'horizontal'
    const extent = horizontal ? rect.width : rect.height
    const separator = Math.min(gap, extent)
    const available = Math.max(0, extent - separator)
    const bounds = ratioBounds(available, horizontal ? first.width : first.height, horizontal ? second.width : second.height)
    const ratio = Math.min(bounds.maxRatio, Math.max(bounds.minRatio, Number.isFinite(node.ratio) ? node.ratio : 0.5))
    const firstExtent = available * ratio
    const secondExtent = Math.max(0, available - firstExtent)
    const splitRect = horizontal
      ? { x: rect.x + firstExtent, y: rect.y, width: separator, height: rect.height }
      : { x: rect.x, y: rect.y + firstExtent, width: rect.width, height: separator }
    result.splits.push({ id: node.id, axis: node.axis, rect: splitRect, available, ratio, ...bounds })
    place(node.first, horizontal ? { ...rect, width: firstExtent } : { ...rect, height: firstExtent })
    place(node.second, horizontal
      ? { ...rect, x: splitRect.x + separator, width: secondExtent }
      : { ...rect, y: splitRect.y + separator, height: secondExtent })
  }

  if (layout.root) place(layout.root, { x: 0, y: 0, width: dimension(size.width), height: dimension(size.height) })
  return result
}
