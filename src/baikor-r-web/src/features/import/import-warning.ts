import type { TFunction } from 'i18next'

export function describeImportWarning(warning: string, t: TFunction) {
  if (
    warning ===
    'The source contains line geometries without a construction width; each line was buffered using the configured area buffer.'
  ) {
    return t('importUx.warnings.buffered')
  }
  const skipped = warning.match(
    /^(\d+) house-connection features were skipped because they do not affect public space\.$/,
  )
  if (skipped) {
    return t('importUx.warnings.skipped', { count: Number(skipped[1]) })
  }
  if (
    warning ===
    "Source statuses 'Executed' and 'Documented' are mapped to Active. 'Canceled' is mapped to Draft and retained in metadata."
  ) {
    return t('importUx.warnings.statuses', {
      active: t('constructionSites.status.active'),
      draft: t('constructionSites.status.draft'),
    })
  }
  return warning
}
