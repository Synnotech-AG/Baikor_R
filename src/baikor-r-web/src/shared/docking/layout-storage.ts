import { createLayout, normalizeLayout } from './layout.ts'
import type { DockLayout, DockNode } from './layout.ts'

export function readLayout(
  key: string,
  defaultRoot: DockNode | null,
  panelIds: readonly string[],
  storage?: Pick<Storage, 'getItem'>,
  defaultCollapsed: readonly string[] = [],
  transform?: (saved: unknown) => unknown,
): DockLayout {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(key)
    return value
      ? normalizeLayout(
          transform ? transform(JSON.parse(value)) : JSON.parse(value),
          defaultRoot,
          panelIds,
          defaultCollapsed,
        )
      : createLayout(defaultRoot, panelIds, defaultCollapsed)
  } catch {
    return createLayout(defaultRoot, panelIds, defaultCollapsed)
  }
}

export function saveLayout(
  key: string,
  layout: DockLayout,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    ;(storage ?? globalThis.localStorage)?.setItem(key, JSON.stringify(layout))
  } catch {
    // Storage may be disabled or full. The in-memory workspace remains usable.
  }
}
