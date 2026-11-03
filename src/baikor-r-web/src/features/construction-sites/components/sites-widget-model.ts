export function sitesPaneMode(width: number, hasSelection: boolean) {
  return width >= 1100 ? 'split' : hasSelection ? 'details' : 'list'
}

export function sitesDividerBounds(width: number) {
  if (!Number.isFinite(width) || width < 1100) {
    return { min: 0, max: 100 }
  }
  const availableWidth = width - 8
  return { min: (560 / availableWidth) * 100, max: 100 - (400 / availableWidth) * 100 }
}

export function clampSitesDivider(value = 56, width = 0) {
  const { min, max } = sitesDividerBounds(width)
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 56))
}
