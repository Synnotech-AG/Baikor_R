export const mailImportEn = {
  'mailImport.title': 'Automatic email import',
  'mailImport.description':
    'Baikor checks the configured IMAP folder and imports ZIP attachments. Messages and read/unread flags stay unchanged.',
  'mailImport.settings': 'Email import settings',
  'mailImport.host': 'IMAP server',
  'mailImport.port': 'Port',
  'mailImport.security': 'TLS connection',
  'mailImport.sslOnConnect': 'Implicit TLS',
  'mailImport.startTls': 'Required STARTTLS',
  'mailImport.username': 'Username',
  'mailImport.password': 'Password / app password',
  'mailImport.passwordSaved':
    'Leave this field empty to use the saved password for the current server, port, TLS mode and username.',
  'mailImport.passwordEmpty': 'No password is saved.',
  'mailImport.clearPassword': 'Clear the saved password',
  'mailImport.folder': 'Folder',
  'mailImport.interval': 'Check interval (seconds)',
  'mailImport.buffer': 'Area buffer (metres)',
  'mailImport.enabled': 'Enable automatic import',
  'mailImport.newOnly':
    'On first activation, only emails arriving after activation are imported. Existing emails are skipped. Resuming the same mailbox also processes emails received while paused.',
  'mailImport.sourceLocked':
    'Pause and save before changing the server, port, TLS mode, username or folder. A changed mailbox starts with new emails only.',
  'mailImport.save': 'Save settings',
  'mailImport.saved': 'Email import settings saved',
  'mailImport.test': 'Test connection',
  'mailImport.testSucceeded': 'Connection and folder access verified. No emails were imported.',
  'mailImport.checkNow': 'Check now',
  'mailImport.checkScheduled': 'Mailbox check scheduled',
  'mailImport.pause': 'Pause',
  'mailImport.resume': 'Enable / resume',
  'mailImport.startFromNow': 'Start from now',
  'mailImport.resetTitle': 'Start from the current mailbox position?',
  'mailImport.resetDescription':
    'Waiting emails and unfinished work from the old mailbox position will be skipped. Only emails arriving afterwards will be imported.',
  'mailImport.cancel': 'Cancel',
  'mailImport.refresh': 'Refresh',
  'mailImport.loading': 'Loading email import…',
  'mailImport.failed': 'The email import action failed. Try again or check the configuration.',
  'mailImport.invalidSettings':
    'Enter a server, username and folder, a port from 1 to 65535, an interval from 30 to 3600 seconds and a buffer from 0.1 to 20 metres.',
  'mailImport.invalidPasswordClear':
    'Pause import before clearing the saved password. Do not enter a replacement at the same time.',
  'mailImport.passwordRequired': 'Enter a password before enabling email import.',
  'mailImport.passwordDestinationChanged':
    'Enter a password for the new connection. To save it without a password, pause import and clear the saved password.',
  'mailImport.keyMissing':
    'Email import is unavailable because its encryption key is missing. Ask your platform operator to configure it.',
  'mailImport.lastChecked': 'Last mailbox check',
  'mailImport.lastSuccess': 'Last successful import',
  'mailImport.activatedAt': 'New-email baseline',
  'mailImport.pendingCount': 'Pending',
  'mailImport.failedCount': 'Failed',
  'mailImport.importedCount': 'Imported',
  'mailImport.state': 'Status',
  'mailImport.state.paused': 'Paused',
  'mailImport.state.disabled': 'Disabled',
  'mailImport.state.idle': 'Waiting for the next check',
  'mailImport.state.checking': 'Checking mailbox',
  'mailImport.state.processing': 'Importing attachments',
  'mailImport.state.error': 'Action required',
  'mailImport.state.unavailable': 'Unavailable',
  'mailImport.state.pending': 'Pending',
  'mailImport.state.imported': 'Imported',
  'mailImport.state.duplicate': 'Already imported',
  'mailImport.state.ignored': 'Ignored',
  'mailImport.state.failed': 'Failed',
  'mailImport.state.retrying': 'Waiting to retry',
  'mailImport.state.retry': 'Waiting to retry',
  'mailImport.state.sourceMissing': 'Source attachment no longer available',
  'mailImport.state.configurationChanged': 'Mailbox configuration changed',
  'mailImport.history': 'Attachment history',
  'mailImport.historyEmpty': 'No new attachments have been processed yet.',
  'mailImport.noZipAttachment': 'No ZIP attachment',
  'mailImport.filename': 'Attachment',
  'mailImport.time': 'Discovered / completed',
  'mailImport.result': 'Result',
  'mailImport.createdCount': '{{count}} construction sites created',
  'mailImport.attempts': '{{count}} attempts',
  'mailImport.retry': 'Retry',
  'mailImport.retryScheduled': 'Attachment retry scheduled',
  'mailImport.details': 'Details',
  'mailImport.unknownState': 'Unknown status',
  'mailImport.settingsInvalid': 'Check the mailbox settings and their permitted values.',
  'mailImport.pauseBeforeSourceChange':
    'Pause and save before changing the mailbox connection or folder.',
  'mailImport.pauseBeforeClearingPassword': 'Pause import before clearing the saved password.',
  'mailImport.encryptionUnavailable':
    'The saved password cannot be decrypted. Check the shared encryption key or enter a replacement password.',
  'mailImport.baselineUnavailable':
    'The mailbox starting position could not be determined. Import has not been activated.',
  'mailImport.uidValidityChanged':
    'The mailbox identity changed. Check the configuration, then choose “Start from now” to resume with new emails only.',
  'mailImport.conflict':
    'Another administrator changed the settings. Close and reopen settings before trying again.',
  'mailImport.notEnabled': 'Enable email import before scheduling a check.',
  'mailImport.retryUnavailable':
    'This attachment cannot be retried. It may already be imported or belong to an earlier mailbox configuration.',
  'mailImport.configurationChanged':
    'Processing stopped because the mailbox configuration changed.',
  'mailImport.archiveInvalid':
    'The ZIP attachment does not contain valid supported construction-site data.',
  'mailImport.importConflict':
    'The import encountered a concurrent database change. Retry this attachment.',
  'mailImport.invalidSecurity': 'Choose implicit TLS or required STARTTLS.',
  'mailImport.uidExhausted':
    'The mailbox has exhausted its message identifiers. Contact the mail server administrator.',
  'mailImport.authenticationFailed':
    'Mailbox authentication failed. Check the username and password / app password.',
  'mailImport.connectionFailed':
    'The mailbox connection failed. Check the server, folder, TLS certificate and network access.',
  'mailImport.attachmentMissing':
    'The source message or attachment is no longer available in the configured folder.',
  'mailImport.attachmentTooLarge': 'The decoded ZIP attachment exceeds the 25 MiB limit.',
  'mailImport.attachmentInvalid': 'The attachment could not be decoded as a supported ZIP file.',
  'mailImport.processingFailed':
    'The attachment could not be processed. Check the service and retry this attachment.',
  'mailImport.retryExhausted':
    'Automatic retries are exhausted. Correct the cause and retry this attachment explicitly.',
}

export const mailImportDe: Record<keyof typeof mailImportEn, string> = {
  'mailImport.title': 'Automatischer E-Mail-Import',
  'mailImport.description':
    'Baikor prüft den eingerichteten IMAP-Ordner und importiert ZIP-Anhänge. Nachrichten und Gelesen-Markierungen bleiben unverändert.',
  'mailImport.settings': 'Einstellungen zum E-Mail-Import',
  'mailImport.host': 'IMAP-Server',
  'mailImport.port': 'Port',
  'mailImport.security': 'TLS-Verbindung',
  'mailImport.sslOnConnect': 'Implizites TLS',
  'mailImport.startTls': 'Verpflichtendes STARTTLS',
  'mailImport.username': 'Benutzername',
  'mailImport.password': 'Passwort / App-Passwort',
  'mailImport.passwordSaved':
    'Das Feld kann leer bleiben, solange Server, Port, TLS-Modus und Benutzername gleich bleiben.',
  'mailImport.passwordEmpty': 'Es ist kein Passwort gespeichert.',
  'mailImport.clearPassword': 'Gespeichertes Passwort löschen',
  'mailImport.folder': 'Ordner',
  'mailImport.interval': 'Prüfintervall (Sekunden)',
  'mailImport.buffer': 'Flächenpuffer (Meter)',
  'mailImport.enabled': 'Automatischen Import aktivieren',
  'mailImport.newOnly':
    'Bei der ersten Aktivierung werden nur danach eingehende E-Mails importiert. Vorhandene E-Mails werden übersprungen. Beim Fortsetzen desselben Postfachs werden auch während der Pause eingegangene E-Mails verarbeitet.',
  'mailImport.sourceLocked':
    'Vor Änderungen an Server, Port, TLS-Modus, Benutzername oder Ordner pausieren und speichern. Ein anderes Postfach startet nur mit neuen E-Mails.',
  'mailImport.save': 'Einstellungen speichern',
  'mailImport.saved': 'Einstellungen zum E-Mail-Import gespeichert',
  'mailImport.test': 'Verbindung testen',
  'mailImport.testSucceeded':
    'Verbindung und Ordnerzugriff geprüft. Es wurden keine E-Mails importiert.',
  'mailImport.checkNow': 'Jetzt prüfen',
  'mailImport.checkScheduled': 'Postfachprüfung eingeplant',
  'mailImport.pause': 'Pausieren',
  'mailImport.resume': 'Aktivieren / fortsetzen',
  'mailImport.startFromNow': 'Ab jetzt neu starten',
  'mailImport.resetTitle': 'Ab der aktuellen Postfachposition starten?',
  'mailImport.resetDescription':
    'Wartende E-Mails und unerledigte Aufträge der alten Postfachposition werden übersprungen. Nur danach eingehende E-Mails werden importiert.',
  'mailImport.cancel': 'Abbrechen',
  'mailImport.refresh': 'Aktualisieren',
  'mailImport.loading': 'E-Mail-Import wird geladen…',
  'mailImport.failed':
    'Die Aktion zum E-Mail-Import ist fehlgeschlagen. Erneut versuchen oder die Konfiguration prüfen.',
  'mailImport.invalidSettings':
    'Server, Benutzername und Ordner, einen Port von 1 bis 65535, ein Intervall von 30 bis 3600 Sekunden und einen Puffer von 0,1 bis 20 Metern angeben.',
  'mailImport.invalidPasswordClear':
    'Vor dem Löschen des gespeicherten Passworts den Import pausieren. Nicht gleichzeitig ein neues Passwort eingeben.',
  'mailImport.passwordRequired': 'Vor dem Aktivieren ein Passwort eingeben.',
  'mailImport.passwordDestinationChanged':
    'Geben Sie ein Passwort für die neue Verbindung ein. Um sie ohne Passwort zu speichern, pausieren Sie den Import und löschen Sie das gespeicherte Passwort.',
  'mailImport.keyMissing':
    'Der E-Mail-Import ist nicht verfügbar, da sein Verschlüsselungsschlüssel fehlt. Bitte die Plattformadministration kontaktieren.',
  'mailImport.lastChecked': 'Letzte Postfachprüfung',
  'mailImport.lastSuccess': 'Letzter erfolgreicher Import',
  'mailImport.activatedAt': 'Startpunkt für neue E-Mails',
  'mailImport.pendingCount': 'Ausstehend',
  'mailImport.failedCount': 'Fehlgeschlagen',
  'mailImport.importedCount': 'Importiert',
  'mailImport.state': 'Status',
  'mailImport.state.paused': 'Pausiert',
  'mailImport.state.disabled': 'Deaktiviert',
  'mailImport.state.idle': 'Wartet auf die nächste Prüfung',
  'mailImport.state.checking': 'Postfach wird geprüft',
  'mailImport.state.processing': 'Anhänge werden importiert',
  'mailImport.state.error': 'Aktion erforderlich',
  'mailImport.state.unavailable': 'Nicht verfügbar',
  'mailImport.state.pending': 'Ausstehend',
  'mailImport.state.imported': 'Importiert',
  'mailImport.state.duplicate': 'Bereits importiert',
  'mailImport.state.ignored': 'Ignoriert',
  'mailImport.state.failed': 'Fehlgeschlagen',
  'mailImport.state.retrying': 'Wartet auf Wiederholung',
  'mailImport.state.retry': 'Wartet auf Wiederholung',
  'mailImport.state.sourceMissing': 'Quellanhang nicht mehr verfügbar',
  'mailImport.state.configurationChanged': 'Postfachkonfiguration geändert',
  'mailImport.history': 'Anhangsverlauf',
  'mailImport.historyEmpty': 'Es wurden noch keine neuen Anhänge verarbeitet.',
  'mailImport.noZipAttachment': 'Kein ZIP-Anhang',
  'mailImport.filename': 'Anhang',
  'mailImport.time': 'Entdeckt / abgeschlossen',
  'mailImport.result': 'Ergebnis',
  'mailImport.createdCount': '{{count}} Baustellen erstellt',
  'mailImport.attempts': '{{count}} Versuche',
  'mailImport.retry': 'Erneut versuchen',
  'mailImport.retryScheduled': 'Wiederholung für den Anhang eingeplant',
  'mailImport.details': 'Details',
  'mailImport.unknownState': 'Unbekannter Status',
  'mailImport.settingsInvalid': 'Postfacheinstellungen und zulässige Werte prüfen.',
  'mailImport.pauseBeforeSourceChange':
    'Vor Änderungen an Postfachverbindung oder Ordner pausieren und speichern.',
  'mailImport.pauseBeforeClearingPassword':
    'Vor dem Löschen des gespeicherten Passworts den Import pausieren.',
  'mailImport.encryptionUnavailable':
    'Das gespeicherte Passwort kann nicht entschlüsselt werden. Gemeinsamen Verschlüsselungsschlüssel prüfen oder ein neues Passwort eingeben.',
  'mailImport.baselineUnavailable':
    'Die Startposition im Postfach konnte nicht ermittelt werden. Der Import wurde nicht aktiviert.',
  'mailImport.uidValidityChanged':
    'Die Postfachidentität hat sich geändert. Konfiguration prüfen und mit „Ab jetzt neu starten“ nur neue E-Mails verarbeiten.',
  'mailImport.conflict':
    'Die Einstellungen wurden zwischenzeitlich geändert. Einstellungen schließen und erneut öffnen.',
  'mailImport.notEnabled': 'Vor dem Einplanen einer Prüfung den E-Mail-Import aktivieren.',
  'mailImport.retryUnavailable':
    'Dieser Anhang kann nicht erneut verarbeitet werden. Er wurde möglicherweise bereits importiert oder gehört zu einer früheren Postfachkonfiguration.',
  'mailImport.configurationChanged':
    'Die Verarbeitung wurde wegen einer geänderten Postfachkonfiguration beendet.',
  'mailImport.archiveInvalid':
    'Der ZIP-Anhang enthält keine gültigen unterstützten Baustellendaten.',
  'mailImport.importConflict':
    'Beim Import wurden Daten gleichzeitig geändert. Diesen Anhang erneut versuchen.',
  'mailImport.invalidSecurity': 'Implizites TLS oder verpflichtendes STARTTLS wählen.',
  'mailImport.uidExhausted':
    'Die Nachrichtenkennungen des Postfachs sind erschöpft. Bitte die Mailserveradministration kontaktieren.',
  'mailImport.authenticationFailed':
    'Postfachanmeldung fehlgeschlagen. Benutzername und Passwort / App-Passwort prüfen.',
  'mailImport.connectionFailed':
    'Postfachverbindung fehlgeschlagen. Server, Ordner, TLS-Zertifikat und Netzwerkzugriff prüfen.',
  'mailImport.attachmentMissing':
    'Die Quellnachricht oder der Anhang ist im eingerichteten Ordner nicht mehr verfügbar.',
  'mailImport.attachmentTooLarge': 'Der dekodierte ZIP-Anhang überschreitet die Grenze von 25 MiB.',
  'mailImport.attachmentInvalid':
    'Der Anhang konnte nicht als unterstützte ZIP-Datei dekodiert werden.',
  'mailImport.processingFailed':
    'Der Anhang konnte nicht verarbeitet werden. Dienst prüfen und diesen Anhang erneut versuchen.',
  'mailImport.retryExhausted':
    'Die automatischen Wiederholungen sind ausgeschöpft. Ursache beheben und diesen Anhang ausdrücklich erneut versuchen.',
}
