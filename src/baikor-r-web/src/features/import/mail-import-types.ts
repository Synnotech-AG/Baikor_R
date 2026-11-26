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
  enabled: boolean
  state: string
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  activatedAt: string | null
  errorKey: string | null
  pendingCount: number
  failedCount: number
  importedCount: number
}

export interface MailImportHistoryItem {
  id: string
  fileName: string
  state: string
  createdAt: string
  completedAt: string | null
  createdCount: number | null
  warnings: string[]
  errorKey: string | null
  attempts: number
  canRetry: boolean
}

export interface MailImportHistoryPage {
  items: MailImportHistoryItem[]
  page: number
  pageSize: number
  totalCount: number
}
