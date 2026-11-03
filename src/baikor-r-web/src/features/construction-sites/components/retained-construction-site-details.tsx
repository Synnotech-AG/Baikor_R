import { AimOutlined } from '@ant-design/icons'
import { Alert, Button, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../shared/formatters'
import { alertHasMapTarget, toAreaFocusAlert } from '../../alerts/alert-model'
import type { AlertDetails } from '../../alerts/types'
import '../record-workspace.css'
import './retained-construction-site-details.css'

interface RetainedConstructionSiteDetailsProps {
  alert: AlertDetails
  onFocus: (alert: AlertDetails) => void
}

export function RetainedConstructionSiteDetails({
  alert,
  onFocus,
}: RetainedConstructionSiteDetailsProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const evidence = alert.details
  if (!evidence) {
    return null
  }
  const canFocus = alertHasMapTarget(alert)

  return (
    <article
      className="editor-panel record-workspace record-details"
      aria-label={t('record.details')}
    >
      <div className="record-details-scroll">
        <header className="section-heading record-heading">
          <h2 tabIndex={-1}>{evidence.constructionSiteTitle}</h2>
        </header>
        <div className="record-details-content">
          <Alert type="info" showIcon title={t('record.retainedSiteHint')} />
          <section className="record-group">
            <h3>{t('record.retainedPeriod')}</h3>
            <ul>
              {evidence.periods.map((period, index) => (
                <li key={`${period.from}-${period.to}-${index}`}>
                  {period.from ? formatDate(period.from, locale) : t('alerts.unbounded')} –{' '}
                  {period.to ? formatDate(period.to, locale) : t('alerts.unbounded')}
                </li>
              ))}
            </ul>
          </section>
          <section className="record-group">
            <h3>{t('constructionSites.sections.areas')}</h3>
            <div className="record-item-list">
              {evidence.areas.map((area) => {
                const target = toAreaFocusAlert(alert, area.id) ?? alert
                const targetAvailable = alertHasMapTarget(target)
                return (
                  <div className="record-item" key={area.id}>
                    <Button
                      className="retained-site-area"
                      type="link"
                      icon={<AimOutlined aria-hidden />}
                      disabled={!targetAvailable}
                      onClick={() => {
                        if (targetAvailable) {
                          onFocus(target)
                        }
                      }}
                    >
                      {area.name}
                    </Button>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
      <footer className="record-footer">
        <div className="record-footer-actions">
          <div className="record-footer-primary">
            <Tooltip title={t('alerts.focus')}>
              <Button
                icon={<AimOutlined aria-hidden />}
                aria-label={t('alerts.focus')}
                disabled={!canFocus}
                onClick={() => {
                  if (canFocus) {
                    onFocus(alert)
                  }
                }}
              />
            </Tooltip>
          </div>
        </div>
      </footer>
    </article>
  )
}
