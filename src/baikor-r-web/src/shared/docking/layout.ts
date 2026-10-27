export type DockAxis = 'horizontal' | 'vertical'
export type DockEdge = 'left' | 'right' | 'top' | 'bottom'
export type DockNode = { kind: 'panel'; id: string } | {
  kind: 'split'
  id: string
  axis: DockAxis
  ratio: number
  first: DockNode
  second: DockNode
}

export interface DockLayout {
  version: 1
  root: DockNode | null
  collapsed: string[]
}

const isRatio = (ratio: unknown): ratio is number => typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 && ratio < 1
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function registeredIds(panelIds: readonly string[]): string[] {
  return [...new Set(panelIds.filter(id => typeof id === 'string' && id.length > 0))]
}

function collectIds(node: DockNode | null, ids = new Set<string>()): Set<string> {
  if (!node) return ids
  ids.add(node.id)
  if (node.kind === 'split') {
    collectIds(node.first, ids)
    collectIds(node.second, ids)
  }
  return ids
}

function nextSplitId(ids: Set<string>): string {
  let index = 1
  while (ids.has(`dock-split-${index}`)) index += 1
  const id = `dock-split-${index}`
  ids.add(id)
  return id
}

function parseTree(value: unknown, known: Set<string>, panels: Set<string>, splits: Set<string>): DockNode | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) throw new Error('Invalid docking node')
  if (value.kind === 'panel') {
    if (!known.has(value.id) || panels.has(value.id)) return null
    panels.add(value.id)
    return { kind: 'panel', id: value.id }
  }
  if (value.kind !== 'split' || (value.axis !== 'horizontal' && value.axis !== 'vertical') || !isRatio(value.ratio) || splits.has(value.id)) {
    throw new Error('Invalid docking split')
  }
  splits.add(value.id)
  const first = parseTree(value.first, known, panels, splits)
  const second = parseTree(value.second, known, panels, splits)
  if (!first) return second
  if (!second) return first
  return { kind: 'split', id: value.id, axis: value.axis, ratio: value.ratio, first, second }
}

function reconcileRoot(value: unknown, panelIds: readonly string[]): DockNode | null {
  const known = registeredIds(panelIds)
  const included = new Set<string>()
  let root = value === null ? null : parseTree(value, new Set(known), included, new Set())
  const usedIds = collectIds(root)
  // Reserve all panel IDs so generated split IDs cannot collide with future leaves.
  for (const id of known) usedIds.add(id)
  for (const id of known) {
    if (included.has(id)) continue
    const leaf: DockNode = { kind: 'panel', id }
    root = root ? { kind: 'split', id: nextSplitId(usedIds), axis: 'horizontal', ratio: 0.5, first: root, second: leaf } : leaf
  }
  return root
}

export function createLayout(defaultRoot: DockNode | null, panelIds: readonly string[]): DockLayout {
  let root: DockNode | null
  try {
    root = reconcileRoot(defaultRoot, panelIds)
  } catch {
    root = reconcileRoot(null, panelIds)
  }
  return { version: 1, root, collapsed: [] }
}

export function normalizeLayout(value: unknown, defaultRoot: DockNode | null, panelIds: readonly string[]): DockLayout {
  try {
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.collapsed)) return createLayout(defaultRoot, panelIds)
    const root = reconcileRoot(value.root, panelIds)
    const known = new Set(registeredIds(panelIds))
    const collapsed = [...new Set(value.collapsed.filter((id): id is string => typeof id === 'string' && known.has(id)))]
    return { version: 1, root, collapsed }
  } catch {
    return createLayout(defaultRoot, panelIds)
  }
}

function containsPanel(node: DockNode | null, id: string): boolean {
  return node !== null && (node.kind === 'panel' ? node.id === id : containsPanel(node.first, id) || containsPanel(node.second, id))
}

function removePanel(node: DockNode, id: string): DockNode | null {
  if (node.kind === 'panel') return node.id === id ? null : node
  const first = removePanel(node.first, id)
  const second = removePanel(node.second, id)
  if (!first) return second
  if (!second) return first
  return first === node.first && second === node.second ? node : { ...node, first, second }
}

function insertPanel(node: DockNode, targetId: string, sourceId: string, edge: DockEdge, splitId: string): DockNode {
  if (node.kind === 'panel') {
    if (node.id !== targetId) return node
    const source: DockNode = { kind: 'panel', id: sourceId }
    const before = edge === 'left' || edge === 'top'
    return { kind: 'split', id: splitId, axis: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical',
      ratio: 0.5, first: before ? source : node, second: before ? node : source }
  }
  const first = insertPanel(node.first, targetId, sourceId, edge, splitId)
  const second = insertPanel(node.second, targetId, sourceId, edge, splitId)
  return first === node.first && second === node.second ? node : { ...node, first, second }
}

export function dockPanel(layout: DockLayout, sourceId: string, targetId: string, edge: DockEdge): DockLayout {
  if (!layout.root || sourceId === targetId || !['left', 'right', 'top', 'bottom'].includes(edge)
    || !containsPanel(layout.root, sourceId) || !containsPanel(layout.root, targetId)) return layout
  const root = removePanel(layout.root, sourceId)
  if (!root) return layout
  const splitId = nextSplitId(collectIds(layout.root))
  return { ...layout, root: insertPanel(root, targetId, sourceId, edge, splitId), collapsed: layout.collapsed.filter(id => id !== sourceId) }
}

export function setPanelCollapsed(layout: DockLayout, id: string, collapsed: boolean): DockLayout {
  if (!containsPanel(layout.root, id) || layout.collapsed.includes(id) === collapsed) return layout
  return { ...layout, collapsed: collapsed ? [...layout.collapsed, id] : layout.collapsed.filter(panelId => panelId !== id) }
}

export function setSplitRatio(layout: DockLayout, id: string, ratio: number): DockLayout {
  if (!isRatio(ratio)) return layout
  function update(node: DockNode): DockNode {
    if (node.kind === 'panel') return node
    if (node.id === id) return node.ratio === ratio ? node : { ...node, ratio }
    const first = update(node.first)
    const second = update(node.second)
    return first === node.first && second === node.second ? node : { ...node, first, second }
  }
  const root = layout.root ? update(layout.root) : null
  return root === layout.root ? layout : { ...layout, root }
}
