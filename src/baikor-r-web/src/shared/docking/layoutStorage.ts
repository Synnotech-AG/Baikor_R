import { createLayout, normalizeLayout } from './layout.ts'
import type { DockLayout, DockNode } from './layout.ts'

export function readLayout(key: string, defaultRoot: DockNode | null, panelIds: readonly string[], storage?: Pick<Storage, 'getItem'>): DockLayout {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(key)
    return value ? normalizeLayout(JSON.parse(value), defaultRoot, panelIds) : createLayout(defaultRoot, panelIds)
  } catch {
    return createLayout(defaultRoot, panelIds)
  }
}

export function saveLayout(key: string, layout: DockLayout, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(key, JSON.stringify(layout))
  } catch {
    // Storage may be disabled or full. The in-memory workspace remains usable.
  }
}
