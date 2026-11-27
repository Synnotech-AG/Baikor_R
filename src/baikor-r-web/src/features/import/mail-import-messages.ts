export const mailImportEn = {
  'mailImport.title': 'Email import',
  'mailImport.dialogTitle': 'Email import settings',
  'mailImport.success': 'Success',
  'mailImport.failure': 'Failure',
  'mailImport.settings': 'Settings',
  'mailImport.host': 'IMAP server',
  'mailImport.port': 'Port',
  'mailImport.security': 'Connection security',
  'mailImport.sslOnConnect': 'Implicit TLS',
  'mailImport.username': 'Username',
  'mailImport.password': 'Password',
  'mailImport.passwordSaved': 'Password saved',
  'mailImport.clearPassword': 'Clear the saved password',
  'mailImport.folder': 'Folder',
  'mailImport.enabled': 'Automatic import',
  'mailImport.save': 'Save',
  'mailImport.saved': 'Email import settings saved',
  'mailImport.test': 'Test connection',
  'mailImport.testSucceeded': 'Connection successful.',
  'mailImport.checkNow': 'Check now',
  'mailImport.checkScheduled': 'Mailbox check scheduled',
  'mailImport.startFromNow': 'Start from now',
  'mailImport.resetTitle': 'Start from the current mailbox position?',
  'mailImport.resetDescription':
    'Waiting emails and unfinished work from the old mailbox position will be skipped. Only emails arriving afterwards will be imported.',
  'mailImport.cancel': 'Cancel',
  'mailImport.failed': 'The email import action failed. Try again or check the configuration.',
  'mailImport.invalidSettings': 'Check the server, port, user and folder.',
  'mailImport.invalidPasswordClear': 'Disable the import before clearing the password.',
  'mailImport.passwordRequired': 'Enter a password before enabling email import.',
  'mailImport.passwordDestinationChanged': 'Enter a password for the changed connection.',
  'mailImport.keyMissing':
    'Email import is unavailable because its encryption key is missing. Ask your platform operator to configure it.',
  'mailImport.historyEmpty': 'No processed imports yet.',
  'mailImport.filename': 'File',
  'mailImport.time': 'Processed at',
  'mailImport.result': 'Result',
  'mailImport.settingsInvalid': 'Check the mailbox settings and their permitted values.',
  'mailImport.pauseBeforeClearingPassword': 'Disable the import before clearing the password.',
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
  'mailImport.title': 'E-Mail-Import',
  'mailImport.dialogTitle': 'E-Mail-Import einrichten',
  'mailImport.success': 'Erfolg',
  'mailImport.failure': 'Fehler',
  'mailImport.settings': 'Einstellungen',
  'mailImport.host': 'IMAP-Server',
  'mailImport.port': 'Port',
  'mailImport.security': 'Verschlüsselung',
  'mailImport.sslOnConnect': 'Implizites TLS',
  'mailImport.username': 'Benutzername',
  'mailImport.password': 'Passwort',
  'mailImport.passwordSaved': 'Passwort gespeichert',
  'mailImport.clearPassword': 'Gespeichertes Passwort löschen',
  'mailImport.folder': 'Ordner',
  'mailImport.enabled': 'Automatischer Import',
  'mailImport.save': 'Speichern',
  'mailImport.saved': 'Einstellungen zum E-Mail-Import gespeichert',
  'mailImport.test': 'Verbindung testen',
  'mailImport.testSucceeded': 'Verbindung erfolgreich.',
  'mailImport.checkNow': 'Jetzt prüfen',
  'mailImport.checkScheduled': 'Postfachprüfung eingeplant',
  'mailImport.startFromNow': 'Ab jetzt neu starten',
  'mailImport.resetTitle': 'Ab der aktuellen Postfachposition starten?',
  'mailImport.resetDescription':
    'Wartende E-Mails und unerledigte Aufträge der alten Postfachposition werden übersprungen. Nur danach eingehende E-Mails werden importiert.',
  'mailImport.cancel': 'Abbrechen',
  'mailImport.failed':
    'Die Aktion zum E-Mail-Import ist fehlgeschlagen. Erneut versuchen oder die Konfiguration prüfen.',
  'mailImport.invalidSettings': 'Server, Port, Benutzername und Ordner prüfen.',
  'mailImport.invalidPasswordClear': 'Zum Löschen des Passworts den Import deaktivieren.',
  'mailImport.passwordRequired': 'Vor dem Aktivieren ein Passwort eingeben.',
  'mailImport.passwordDestinationChanged': 'Für die geänderte Verbindung ein Passwort eingeben.',
  'mailImport.keyMissing':
    'Der E-Mail-Import ist nicht verfügbar, da sein Verschlüsselungsschlüssel fehlt. Bitte die Plattformadministration kontaktieren.',
  'mailImport.historyEmpty': 'Noch keine verarbeiteten Importe.',
  'mailImport.filename': 'Datei',
  'mailImport.time': 'Zeitpunkt',
  'mailImport.result': 'Ergebnis',
  'mailImport.settingsInvalid': 'Postfacheinstellungen und zulässige Werte prüfen.',
  'mailImport.pauseBeforeClearingPassword': 'Zum Löschen des Passworts den Import deaktivieren.',
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
