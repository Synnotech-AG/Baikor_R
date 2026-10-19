import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/i18n'
import './index.css'
import App from './App.tsx'
import { ApplicationProviders } from './app/ApplicationProviders'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationProviders>
      <App />
    </ApplicationProviders>
  </StrictMode>,
)
