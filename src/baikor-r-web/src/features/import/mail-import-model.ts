import type {
  MailImportDraft,
  MailImportRequest,
  MailImportSettings,
  MailImportTestRequest,
} from './mail-import-types'

export function toMailImportDraft(settings: MailImportSettings): MailImportDraft {
  return {
    enabled: settings.enabled,
    host: settings.host,
    port: settings.port,
    security: settings.security,
    username: settings.username,
    folder: settings.folder,
    pollIntervalSeconds: settings.pollIntervalSeconds,
    bufferMetres: settings.bufferMetres,
    version: settings.version,
    password: '',
    clearPassword: false,
    resetCursor: false,
  }
}

export function toMailImportRequest(draft: MailImportDraft): MailImportRequest {
  return {
    ...draft,
    host: draft.host.trim(),
    username: draft.username.trim(),
    folder: draft.folder.trim(),
    password: draft.password.length > 0 ? draft.password : null,
  }
}

export function toMailImportTestRequest(
  draft: MailImportDraft,
  hasPassword: boolean,
): MailImportTestRequest {
  return {
    host: draft.host.trim(),
    port: draft.port,
    security: draft.security,
    username: draft.username.trim(),
    folder: draft.folder.trim(),
    password: draft.password.length > 0 ? draft.password : null,
    useSavedPassword: hasPassword && draft.password.length === 0 && !draft.clearPassword,
  }
}

export function validateMailImportDraft(
  draft: MailImportDraft,
  hasPassword: boolean,
): string | null {
  if (
    !draft.host.trim() ||
    !draft.username.trim() ||
    !draft.folder.trim() ||
    !Number.isInteger(draft.port) ||
    draft.port < 1 ||
    draft.port > 65535 ||
    !['sslOnConnect', 'startTls'].includes(draft.security) ||
    !Number.isInteger(draft.pollIntervalSeconds) ||
    draft.pollIntervalSeconds < 30 ||
    draft.pollIntervalSeconds > 3600 ||
    !Number.isFinite(draft.bufferMetres) ||
    draft.bufferMetres < 0.1 ||
    draft.bufferMetres > 20
  ) {
    return 'mailImport.invalidSettings'
  }
  if (draft.clearPassword && (draft.enabled || draft.password.length > 0)) {
    return 'mailImport.invalidPasswordClear'
  }
  if (draft.enabled && !draft.password && (!hasPassword || draft.clearPassword)) {
    return 'mailImport.passwordRequired'
  }
  return null
}
