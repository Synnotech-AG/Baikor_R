import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeLayout } from './layout'
import type { DockLayout, DockNode } from './layout'
import { readLayout, saveLayout } from './layoutStorage'

/** State and persistence only; placement and rendering stay separate. */
export function useDockingLayout(storageKey: string, defaultRoot: DockNode, panelIds: string[]) {
  const [layout, setLayout] = useState(() => readLayout(storageKey, defaultRoot, panelIds))
  const current = useRef(layout)
  const loadedKey = useRef(storageKey)
  const signature = JSON.stringify(panelIds)

  const update = useCallback((change: (layout: DockLayout) => DockLayout, persist = true) => {
    const next = change(current.current)
    current.current = next
    setLayout(next)
    if (persist) saveLayout(storageKey, next)
  }, [storageKey])
  const persist = useCallback(() => saveLayout(storageKey, current.current), [storageKey])

  useEffect(() => {
    const ids: string[] = JSON.parse(signature)
    const next = loadedKey.current === storageKey ? normalizeLayout(current.current, defaultRoot, ids)
      : readLayout(storageKey, defaultRoot, ids)
    loadedKey.current = storageKey
    current.current = next
    setLayout(next)
  }, [storageKey, defaultRoot, signature])

  return { layout, update, persist }
}
