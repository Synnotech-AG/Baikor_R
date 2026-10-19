import axios from 'axios'
import { parseApiError } from './errors'
import { reportServerError } from './serverErrorMiddleware'

let antiforgeryToken: string | null = null

export const httpClient = axios.create({
  headers: { 'Content-Type': 'application/json' },
})

export function setAntiforgeryToken(token: string | null) {
  antiforgeryToken = token
}

httpClient.interceptors.request.use((config) => {
  if (antiforgeryToken && config.method && config.method.toLowerCase() !== 'get') {
    config.headers.set('X-CSRF-TOKEN', antiforgeryToken)
  }
  return config
})

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) {
      const parsed = parseApiError(error, 'The server is currently unavailable.')
      reportServerError({ errorKey: parsed.errorKey ?? 'api.unavailable', fallbackMessage: parsed.message })
    }
    return Promise.reject(error)
  },
)
