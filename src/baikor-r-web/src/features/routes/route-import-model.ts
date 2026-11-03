export function routeImportFileError(file: Pick<File, 'name' | 'size'>): string | null {
  if (!/\.zip$/i.test(file.name)) {
    return 'routes.import.file.extension'
  }
  if (file.size <= 0 || file.size > 25 * 1024 * 1024) {
    return 'routes.import.file.size'
  }
  return null
}

const routineImportNotes = new Set([
  'Unreferenced shapes are excluded; paths without trips have no proven service.',
  'Routes without trips are excluded; no daily availability is inferred.',
  "Only supplied route/shape bindings are updated within this feed's service-date coverage; missing bindings are retained.",
  'Suppressed source routes and paths remain suppressed and are not updated or restored.',
])

export function routeImportWarnings(warnings: readonly string[]): string[] {
  return warnings.filter((warning) => !routineImportNotes.has(warning))
}

const importWarningKeys = new Map([
  [
    'Unmatched shape bindings create separate paths within their source route. Regenerated source shape IDs require explicit provider reconciliation.',
    'routes.import.notes.newPathIds',
  ],
])

export function routeImportWarningKey(warning: string): string | undefined {
  return importWarningKeys.get(warning)
}
