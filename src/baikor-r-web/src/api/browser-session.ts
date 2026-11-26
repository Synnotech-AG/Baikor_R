import axios from 'axios'
import { httpClient, sessionProbeHeaders } from './http-client'

export function monitorBrowserSession(unmountApp: () => void) {
  let stopped = false
  let checking = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadline = Infinity

  function scheduleCheck(delayMs: number) {
    const next = Date.now() + delayMs
    if (stopped || next >= deadline) {
      return
    }
    clearTimeout(timer)
    deadline = next
    timer = setTimeout(() => {
      deadline = Infinity
      void check()
    }, delayMs)
  }

  async function check() {
    if (stopped || checking) {
      return
    }
    checking = true
    try {
      await httpClient.get('/api/me', { headers: sessionProbeHeaders, timeout: 10000 })
    } catch {
      // A network failure cannot establish whether the browser cookie has expired.
      scheduleCheck(15000)
    } finally {
      checking = false
    }
  }

  const interceptor = httpClient.interceptors.response.use(
    (response) => {
      const remaining = response.headers['x-baikor-session-remaining']
      if (
        response.config.headers.get('X-Baikor-Session') === '1' &&
        typeof remaining === 'string' &&
        /^\d+$/.test(remaining)
      ) {
        // Recheck the shared cookie at the earliest known deadline. Another tab may have renewed it.
        scheduleCheck(Math.min(2147483647, Math.max(1000, Number(remaining) * 1000)))
      }
      return response
    },
    (error: unknown) => {
      if (
        !stopped &&
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        error.config?.headers.get('X-Baikor-Session') === '1'
      ) {
        stop()
        unmountApp()
        window.location.replace('/signed-out.html')
      }
      return Promise.reject(error)
    },
  )
  function onVisible() {
    if (document.visibilityState === 'visible') {
      void check()
    }
  }
  function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) {
      void check()
    }
  }
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', onVisible)
  document.addEventListener('visibilitychange', onVisible)
  function stop() {
    stopped = true
    clearTimeout(timer)
    httpClient.interceptors.response.eject(interceptor)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('online', onVisible)
    document.removeEventListener('visibilitychange', onVisible)
  }
  return stop
}
