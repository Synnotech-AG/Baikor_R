import { useCallback, useEffect, useRef, useState } from 'react'
import { useAntiforgeryEndpoint } from './api/endpoints/use-antiforgery-endpoint'
import { useMeEndpoint } from './api/endpoints/use-me-endpoint'
import { setAntiforgeryToken } from './api/http-client'
import { ApplicationHeader, type ApplicationPage } from './app/application-header'
import { ConstructionSitesPage } from './features/construction-sites/construction-sites-page'
import { editorRoles } from './features/construction-sites/constants'
import type { AntiforgeryToken, UserSession } from './features/construction-sites/types'
import type { NavigationGuard } from './features/construction-sites/workspace'
import { ImportPage } from './features/import/import-page'
import 'ol/ol.css'
import './app.css'

function App() {
  const [page, setPage] = useState<ApplicationPage>('constructionSites')
  const [session, setSession] = useState<UserSession | null>(null)
  const [token, setToken] = useState<AntiforgeryToken | null>(null)
  const navigationGuard = useRef<NavigationGuard | null>(null)
  const registerNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    navigationGuard.current = guard
  }, [])
  const requestPageChange = (nextPage: ApplicationPage) => {
    if (page === nextPage) {
      return
    }
    const proceed = () => setPage(nextPage)
    if (navigationGuard.current) {
      navigationGuard.current(proceed)
    } else {
      proceed()
    }
  }
  const { execute: loadMe } = useMeEndpoint()
  const { execute: loadAntiforgery } = useAntiforgeryEndpoint()

  useEffect(() => {
    Promise.all([loadMe(), loadAntiforgery()])
      .then(([userSession, antiforgery]) => {
        setSession(userSession)
        setToken(antiforgery)
        setAntiforgeryToken(antiforgery.token)
      })
      .catch(() => {
        setSession(null)
        setToken(null)
        setAntiforgeryToken(null)
      })
  }, [loadAntiforgery, loadMe])

  return (
    <div className="app-shell">
      <ApplicationHeader
        page={page}
        session={session}
        antiforgeryToken={token}
        onPageChange={requestPageChange}
      />
      <div hidden={page !== 'constructionSites'}>
        <ConstructionSitesPage
          session={session}
          antiforgeryReady={token !== null}
          active={page === 'constructionSites'}
          onRegisterNavigationGuard={registerNavigationGuard}
        />
      </div>
      {page === 'import' && (
        <ImportPage
          onViewSites={() => requestPageChange('constructionSites')}
          enabled={
            token !== null && (session?.roles.some((role) => editorRoles.includes(role)) ?? false)
          }
        />
      )}
    </div>
  )
}

export default App
