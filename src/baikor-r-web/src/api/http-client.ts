import axios from 'axios'
import { parseApiError } from './errors'
import { reportServerError } from './server-error-middleware'

let antiforgeryToken: string | null = null

export const httpClient = axios.create({
  headers: { 'Content-Type': 'application/json' },
})

export const sessionProbeHeaders = { 'X-Baikor-Session-Probe': '1' }

export function setAntiforgeryToken(token: string | null) {
  antiforgeryToken = token
}

httpClient.interceptors.request.use((config) => {
  const pageUrl = new URL(globalThis.window?.location?.href ?? 'http://localhost/')
  const target = new URL(httpClient.getUri(config), pageUrl)
  if (target.origin !== pageUrl.origin || !target.pathname.startsWith('/api/')) {
    config.headers.delete(['X-Baikor-Session', 'X-Baikor-Session-Probe', 'X-CSRF-TOKEN'])
    return config
  }
  config.headers.set('X-Baikor-Session', '1')
  if (antiforgeryToken && config.method && config.method.toLowerCase() !== 'get') {
    config.headers.set('X-CSRF-TOKEN', antiforgeryToken)
  }
  return config
})

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error)
    }
    if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) {
      const parsed = parseApiError(error, 'The server is currently unavailable.')
      reportServerError({
        errorKey: parsed.errorKey ?? 'api.unavailable',
        fallbackMessage: parsed.message,
      })
    }
    return Promise.reject(error)
  },
)
