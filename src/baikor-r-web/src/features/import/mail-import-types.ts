export interface MailImportSettings {
  enabled: boolean
  host: string
  port: number
  security: 'sslOnConnect' | 'startTls'
  username: string
  folder: string
  pollIntervalSeconds: number
  bufferMetres: number
  hasPassword: boolean
  encryptionConfigured: boolean
  version: number
}

export interface MailImportRequest {
  enabled: boolean
  host: string
  port: number
  security: MailImportSettings['security']
  username: string
  folder: string
  pollIntervalSeconds: number
  bufferMetres: number
  version: number
  password: string | null
  clearPassword: boolean
  resetCursor: boolean
}

export interface MailImportDraft extends Omit<MailImportRequest, 'password'> {
  password: string
}

export interface MailImportTestRequest {
  host: string
  port: number
  security: MailImportSettings['security']
  username: string
  folder: string
  password: string | null
  useSavedPassword: boolean
}

export interface MailImportStatus {
  errorKey: string | null
}

export interface MailImportHistoryItem {
  id: string
  fileName: string
  state: 'imported' | 'failed' | 'sourceMissing'
  completedAt: string
}

export interface MailImportHistoryPage {
  items: MailImportHistoryItem[]
  page: number
  pageSize: number
  totalCount: number
}
