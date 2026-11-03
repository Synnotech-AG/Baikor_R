function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function contains(value: unknown, id: string): boolean {
  if (!record(value)) {
    return false
  }
  return value.kind === 'panel'
    ? value.id === id
    : value.kind === 'split' && (contains(value.first, id) || contains(value.second, id))
}

/** Merge the retired Details panel into Sites without resetting the other dock positions. */
export function mergeConstructionSitePanels(saved: unknown): unknown {
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !Array.isArray(saved.collapsed) ||
    !contains(saved.root, 'details')
  ) {
    return saved
  }
  const collapsed = new Set(saved.collapsed)
  const useDetailsPosition =
    !contains(saved.root, 'sites') || (collapsed.has('sites') && !collapsed.has('details'))
  const wasVisible =
    (contains(saved.root, 'sites') && !collapsed.has('sites')) || !collapsed.has('details')
  const merge = (node: unknown): unknown => {
    if (!record(node)) {
      return node
    }
    if (node.kind === 'panel') {
      if (node.id === 'details') {
        return useDetailsPosition ? { ...node, id: 'sites' } : null
      }
      return node.id === 'sites' && useDetailsPosition ? null : node
    }
    if (node.kind !== 'split') {
      return node
    }
    const first = merge(node.first)
    const second = merge(node.second)
    return !first ? second : !second ? first : { ...node, first, second }
  }
  return {
    ...saved,
    root: merge(saved.root),
    collapsed: [
      ...saved.collapsed.filter((id) => id !== 'sites' && id !== 'details'),
      ...(wasVisible ? [] : ['sites']),
    ],
  }
}
