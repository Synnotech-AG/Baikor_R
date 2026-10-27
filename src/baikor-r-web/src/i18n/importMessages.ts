export const importDe = {
  'importUx.saved': 'Der Import ist abgeschlossen. Die neuen Baustellen sind gespeichert und können bearbeitet werden.',
  'importUx.created': 'Baustellen angelegt',
  'importUx.skipped': 'Hausanschlüsse übersprungen',
  'importUx.notes': 'Hinweise zum Import',
  'importUx.viewSites': 'Baustellen ansehen',
  'importUx.viewSitesHint': 'Öffnet die Übersicht mit allen Baustellen.',
  'importUx.details': 'Importdetails und Quellstatus anzeigen',
  'importUx.features': 'Datensätze in der Quelldatei',
  'importUx.sourceStatuses': 'Angelegte Baustellen nach Quellstatus',
  'importUx.warnings.buffered': 'Die Quelldatei enthält Linien ohne Baubreite. Für jede Linie wurde mit dem festgelegten Puffer eine Baustellenfläche erzeugt.',
  'importUx.warnings.skipped': '{{count}} Hausanschlüsse wurden übersprungen, weil sie den öffentlichen Raum nicht betreffen.',
  'importUx.warnings.statuses': 'Die Quellstatus „Executed“ und „Documented“ wurden als „{{active}}“ übernommen. „Canceled“ wurde als „{{draft}}“ übernommen; der ursprüngliche Status bleibt in den Metadaten erhalten.',
} as const

export const importEn: Record<keyof typeof importDe, string> = {
  'importUx.saved': 'The import is complete. The new construction sites have been saved and can be edited.',
  'importUx.created': 'Construction sites created',
  'importUx.skipped': 'House connections skipped',
  'importUx.notes': 'Import notes',
  'importUx.viewSites': 'View construction sites',
  'importUx.viewSitesHint': 'Opens the overview of all construction sites.',
  'importUx.details': 'Show import details and source statuses',
  'importUx.features': 'Records in the source file',
  'importUx.sourceStatuses': 'Created construction sites by source status',
  'importUx.warnings.buffered': 'The source file contains lines without a construction width. Each line was buffered using the configured buffer to create a construction-site area.',
  'importUx.warnings.skipped': '{{count}} house connections were skipped because they do not affect public space.',
  'importUx.warnings.statuses': 'The source statuses “Executed” and “Documented” were imported as “{{active}}”. “Canceled” was imported as “{{draft}}”; the original status remains in the metadata.',
}
