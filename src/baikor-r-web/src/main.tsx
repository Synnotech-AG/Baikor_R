import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/i18n'
import './index.css'
import App from './app.tsx'
import { ApplicationProviders } from './app/application-providers'
import { monitorBrowserSession } from './api/browser-session'
import { setAntiforgeryToken } from './api/http-client'

const root = createRoot(document.getElementById('root')!)
const stopMonitoring = monitorBrowserSession(() => {
  setAntiforgeryToken(null)
  root.unmount()
})
import.meta.hot?.dispose(stopMonitoring)

root.render(
  <StrictMode>
    <ApplicationProviders>
      <App />
    </ApplicationProviders>
  </StrictMode>,
)
