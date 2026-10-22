import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import type { AntiforgeryToken, UserSession } from '../features/construction-sites/types'

export type ApplicationPage = 'constructionSites' | 'import'

interface ApplicationHeaderProps {
  page: ApplicationPage
  session: UserSession | null
  antiforgeryToken: AntiforgeryToken | null
  onPageChange: (page: ApplicationPage) => void
}

export function ApplicationHeader({ page, session, antiforgeryToken, onPageChange }: ApplicationHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className="topbar">
      <div className="application-brand">
        <img className="application-logo" src="/r-next-logo.svg" alt="R_next – R_Lab Mobilität" />
        <h1>{t('app.title')}</h1>
      </div>
      <nav className="main-navigation" aria-label={t('nav.main')}>
        <Button type={page === 'constructionSites' ? 'primary' : 'text'} onClick={() => onPageChange('constructionSites')}>
          {t('nav.constructionSites')}
        </Button>
        <Button type={page === 'import' ? 'primary' : 'text'} onClick={() => onPageChange('import')}>
          {t('nav.import')}
        </Button>
      </nav>
      <div className="topbar-status">
        {session && (
          <form method="post" action="/auth/logout" className="user-session" aria-label={t('auth.userSession')}>
            <span className="user-session-name"><UserOutlined aria-hidden /> {session.name}</span>
            <input type="hidden" name="__RequestVerificationToken" value={antiforgeryToken?.token ?? ''} />
            <Tooltip title={t('auth.logout')}>
              <Button
                className="logout-action"
                htmlType="submit"
                icon={<LogoutOutlined />}
                disabled={!antiforgeryToken}
                aria-label={t('auth.logout')}
              >
                <span className="logout-action-label">{t('auth.logout')}</span>
              </Button>
            </Tooltip>
          </form>
        )}
      </div>
    </header>
  )
}
