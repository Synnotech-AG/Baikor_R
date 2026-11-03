import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeLayout } from './layout'
import type { DockLayout, DockNode } from './layout'
import { readLayout, saveLayout } from './layout-storage'

/** State and persistence only; placement and rendering stay separate. */
export function useDockingLayout(
  storageKey: string,
  defaultRoot: DockNode,
  panelIds: string[],
  defaultCollapsed: string[] = [],
  transform?: (saved: unknown) => unknown,
) {
  const [layout, setLayout] = useState(() =>
    readLayout(storageKey, defaultRoot, panelIds, undefined, defaultCollapsed, transform),
  )
  const current = useRef(layout)
  const loadedKey = useRef(storageKey)
  const signature = JSON.stringify(panelIds)
  const collapsedSignature = JSON.stringify(defaultCollapsed)

  const update = useCallback(
    (change: (layout: DockLayout) => DockLayout, persist = true) => {
      const next = change(current.current)
      current.current = next
      setLayout(next)
      if (persist) {
        saveLayout(storageKey, next)
      }
    },
    [storageKey],
  )
  const persist = useCallback(() => saveLayout(storageKey, current.current), [storageKey])

  useEffect(() => {
    const ids: string[] = JSON.parse(signature)
    const collapsed: string[] = JSON.parse(collapsedSignature)
    const next =
      loadedKey.current === storageKey
        ? normalizeLayout(
            transform ? transform(current.current) : current.current,
            defaultRoot,
            ids,
            collapsed,
          )
        : readLayout(storageKey, defaultRoot, ids, undefined, collapsed, transform)
    loadedKey.current = storageKey
    current.current = next
    setLayout(next)
  }, [storageKey, defaultRoot, signature, collapsedSignature, transform])

  return { layout, update, persist }
}
