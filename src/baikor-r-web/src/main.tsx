import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/i18n'
import './index.css'
import App from './app.tsx'
import { ApplicationProviders } from './app/application-providers'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationProviders>
      <App />
    </ApplicationProviders>
  </StrictMode>,
)
