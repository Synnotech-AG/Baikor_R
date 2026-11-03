import { AimOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Select, Space, Tag, Timeline, Tooltip } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate, formatDateTime, formatTimestamp } from '../../shared/formatters'
import { alertHasMapTarget } from './alert-model'
import { AlertPathEvidence } from './alert-path-evidence'
import type { AlertDetails, AlertHandling, AlertSelectionOrigin } from './types'

interface AlertDetailsPaneProps {
  alert: AlertDetails
  canReview: boolean
  saving: boolean
  stale?: boolean
  historical?: boolean
  readOnly?: boolean
  onOpenRelatedAlert?: (id: string) => void
  onOpenCanonical?: (id: string) => void
  onViewEvidence?: (revision: number) => void
  onRefresh?: () => void
  onReview?: (handling: AlertHandling, note: string) => Promise<void>
  onFocus: (alert: AlertDetails, origin?: AlertSelectionOrigin) => void
  onOpenConstructionSite: (id: string, alert?: AlertDetails) => void
  onOpenRoute: (id: string) => void
}

export function AlertDetailsPane({
  alert,
  canReview,
  saving,
  stale = false,
  historical = false,
  readOnly = false,
  onOpenRelatedAlert,
  onOpenCanonical,
  onViewEvidence,
  onRefresh,
  onReview,
  onFocus,
  onOpenConstructionSite,
  onOpenRoute,
}: AlertDetailsPaneProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const [handling, setHandling] = useState<AlertHandling>(alert.handling)
  const [note, setNote] = useState('')
  useEffect(() => {
    setHandling(alert.handling)
  }, [alert.id, alert.version, alert.handling])
  useEffect(() => {
    setNote('')
  }, [alert.id])
  const evidence = alert.type === 'routeConflict' ? alert.details : null
  const description = alert.type === 'routeConflict' ? null : alert.description
  const reviewable = canReview && !historical && !readOnly && !alert.supersededByAlertId
  const focus = (target: AlertDetails) => onFocus(target, historical ? 'historical' : 'current')

  return (
    <>
      {stale && (
        <Alert
          className="alert-details-stale"
          type="warning"
          showIcon
          title={t('alerts.detailsStale')}
          action={
            <Button size="small" onClick={onRefresh}>
              {t('alerts.refresh')}
            </Button>
          }
        />
      )}
      <div className="alert-details-scroll">
        <h3>
          {historical
            ? t('alerts.historicalEvidence')
            : evidence
              ? t('alerts.conflictDetails')
              : alert.summary}
        </h3>
        {historical && <Alert type="info" showIcon title={t('alerts.historicalHint')} />}
        {alert.supersededByAlertId && !historical && (
          <Alert
            type="info"
            showIcon
            title={t('alerts.supersededHint')}
            action={
              <Button
                size="small"
                onClick={() =>
                  (onOpenCanonical ?? onOpenRelatedAlert)?.(alert.supersededByAlertId!)
                }
              >
                {t('alerts.openCanonical')}
              </Button>
            }
          />
        )}
        {readOnly && !alert.supersededByAlertId && (
          <Alert type="info" showIcon title={t('alerts.relatedReadOnly')} />
        )}
        {!historical && (
          <Space wrap size={4}>
            <Tag color={alert.condition === 'present' ? 'orange' : 'default'}>
              {t(`alerts.condition.${alert.condition}`)}
            </Tag>
            <Tag color={alert.handling === 'open' ? 'blue' : 'default'}>
              {t(`alerts.handling.${alert.handling}`)}
            </Tag>
          </Space>
        )}
        {!historical && description && <p className="alert-description">{description}</p>}
        {evidence && (
          <dl className="alert-subjects">
            <div>
              <dt>{t('alerts.site')}</dt>
              <dd>
                {historical ? (
                  evidence.constructionSiteTitle
                ) : (
                  <Button
                    className="alert-subject-link"
                    type="link"
                    onClick={() => onOpenConstructionSite(evidence.constructionSiteId, alert)}
                  >
                    {evidence.constructionSiteTitle}
                  </Button>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('alerts.route')}</dt>
              <dd>
                {historical ? (
                  evidence.routeTitle
                ) : (
                  <Button
                    className="alert-subject-link"
                    type="link"
                    onClick={() => onOpenRoute(evidence.routeId)}
                  >
                    {evidence.routeTitle}
                  </Button>
                )}
              </dd>
            </div>
          </dl>
        )}
        {historical && (
          <dl className="alert-facts">
            <div>
              <dt>{t('alerts.revision')}</dt>
              <dd>{alert.evidenceRevision}</dd>
            </div>
            <div>
              <dt>{t('alerts.evidenceCreated')}</dt>
              <dd>{formatDateTime(alert.createdAt, locale)}</dd>
            </div>
          </dl>
        )}
        {evidence && (
          <section className="alert-evidence">
            <h4>{t('alerts.periods')}</h4>
            <ul className="alert-periods">
              {evidence.periods.map((period, index) => (
                <li key={`${period.from}-${period.to}-${index}`}>
                  {period.from ? formatDate(period.from, locale) : t('alerts.unbounded')} –{' '}
                  {period.to ? formatDate(period.to, locale) : t('alerts.unbounded')}
                </li>
              ))}
            </ul>
            <AlertPathEvidence alert={alert} onFocus={focus} />
          </section>
        )}
        {reviewable && (
          <section className="alert-review">
            <h4>{t('alerts.handling')}</h4>
            <Select
              aria-label={t('alerts.handling')}
              value={handling}
              onChange={setHandling}
              disabled={saving}
              options={(['open', 'acknowledged', 'handled'] as const).map((value) => ({
                value,
                label: t(`alerts.handling.${value}`),
              }))}
            />
            <label htmlFor={`alert-note-${alert.id}`}>{t('alerts.note')}</label>
            <Input.TextArea
              id={`alert-note-${alert.id}`}
              value={note}
              maxLength={4000}
              autoSize={{ minRows: 2, maxRows: 6 }}
              disabled={saving}
              onChange={(event) => setNote(event.target.value)}
            />
          </section>
        )}
        {!historical && (
          <section className="alert-related">
            {Boolean(alert.relatedAlerts?.length) && (
              <>
                <h4>{t('alerts.related')}</h4>
                <ul>
                  {alert.relatedAlerts?.map((related) => (
                    <li key={related.id}>
                      <Button
                        type="link"
                        className="alert-subject-link"
                        onClick={() => onOpenRelatedAlert?.(related.id)}
                      >
                        {related.summary}
                      </Button>
                      <small>{t(`alerts.handling.${related.handling}`)}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        {!historical && (
          <details className="alert-history">
            <summary>{t('alerts.history')}</summary>
            {alert.events.length ? (
              <Timeline
                items={alert.events.map((event) => ({
                  key: event.id,
                  content: (
                    <div>
                      <strong>
                        {i18n.exists(`alerts.event.${event.kind}`)
                          ? t(`alerts.event.${event.kind}`)
                          : event.kind}
                      </strong>
                      <small>{formatTimestamp(event.createdAt, locale)}</small>
                      {event.handling && <p>{t(`alerts.handling.${event.handling}`)}</p>}
                      {event.note && <p className="alert-description">{event.note}</p>}
                      {onViewEvidence &&
                        alert.evidenceRevisions?.includes(event.evidenceRevision) && (
                          <Button
                            size="small"
                            type="link"
                            onClick={() => onViewEvidence(event.evidenceRevision)}
                          >
                            {t('alerts.viewEvidence')}
                          </Button>
                        )}
                    </div>
                  ),
                }))}
              />
            ) : (
              <p className="alert-hint">{t('alerts.historyEmpty')}</p>
            )}
          </details>
        )}
      </div>
      <footer className="alert-footer">
        {reviewable && (
          <Button
            type="primary"
            loading={saving}
            disabled={stale}
            onClick={() => {
              void onReview?.(handling, note)
            }}
          >
            {t('alerts.review')}
          </Button>
        )}
        <Tooltip title={t('alerts.focus')}>
          <Button
            icon={<AimOutlined />}
            aria-label={t('alerts.focus')}
            disabled={!alertHasMapTarget(alert)}
            onClick={() => {
              if (alertHasMapTarget(alert)) {
                focus(alert)
              }
            }}
          />
        </Tooltip>
      </footer>
    </>
  )
}
