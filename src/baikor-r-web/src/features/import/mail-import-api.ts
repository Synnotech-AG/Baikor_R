import { httpClient, sessionProbeHeaders } from '../../api/http-client'
import type {
  MailImportHistoryPage,
  MailImportRequest,
  MailImportSettings,
  MailImportStatus,
  MailImportTestRequest,
} from './mail-import-types'

const baseUrl = '/api/settings/mail-import'

export async function getMailImportSettings(signal?: AbortSignal) {
  return (
    await httpClient.get<MailImportSettings>(baseUrl, { signal, headers: sessionProbeHeaders })
  ).data
}

export async function getMailImportStatus(signal?: AbortSignal) {
  return (
    await httpClient.get<MailImportStatus>(`${baseUrl}/status`, {
      signal,
      headers: sessionProbeHeaders,
    })
  ).data
}

export async function getMailImportHistory(page: number, signal?: AbortSignal) {
  return (
    await httpClient.get<MailImportHistoryPage>(`${baseUrl}/history`, {
      params: { page, pageSize: 20 },
      headers: sessionProbeHeaders,
      signal,
    })
  ).data
}

export async function saveMailImportSettings(request: MailImportRequest) {
  return (await httpClient.put<MailImportSettings>(baseUrl, request)).data
}

export async function testMailImportConnection(request: MailImportTestRequest) {
  return (await httpClient.post<{ connected: boolean }>(`${baseUrl}/test`, request)).data
}

export async function checkMailImportNow() {
  await httpClient.post(`${baseUrl}/check`)
}

export async function retryMailImport(id: string) {
  await httpClient.post(`${baseUrl}/history/${encodeURIComponent(id)}/retry`)
}
