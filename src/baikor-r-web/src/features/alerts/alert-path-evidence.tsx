import { AimOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../shared/formatters'
import { toPathFocusAlert } from './alert-model'
import type { AlertDetails } from './types'

export function AlertPathEvidence({
  alert,
  onFocus,
}: {
  alert: AlertDetails
  onFocus: (alert: AlertDetails) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const paths = alert.details?.paths ?? []
  if (!paths.length) {
    return null
  }
  return (
    <section className="alert-path-evidence">
      <h4>{t('alerts.paths')}</h4>
      {paths.map((path, index) => {
        const title = path.pathTitle || t('alerts.pathNumber', { number: index + 1 })
        const target = toPathFocusAlert(alert, index)
        return (
          <section className="alert-path-card" key={`${path.pathId ?? index}-${index}`}>
            <Button
              type="link"
              className="alert-subject-link"
              icon={<AimOutlined />}
              aria-label={t('alerts.focusPath', { title })}
              disabled={!target}
              onClick={() => {
                if (target) {
                  onFocus(target)
                }
              }}
            >
              {title}
            </Button>
            {path.hasOperatingCalendar ? (
              <p className="alert-path-availability">
                <span>{t('alerts.calendar')}: </span>
                {path.periods.length
                  ? path.periods
                      .map(
                        (period) =>
                          `${period.from ? formatDate(period.from, locale) : t('alerts.unbounded')} – ${period.to ? formatDate(period.to, locale) : t('alerts.unbounded')}`,
                      )
                      .join(' · ')
                  : t('alerts.noOperation')}
              </p>
            ) : (
              <p className="alert-path-availability">
                {t('alerts.daily')}
                {(path.validFrom || path.validTo) && (
                  <>
                    : {path.validFrom ? formatDate(path.validFrom, locale) : t('alerts.unbounded')}{' '}
                    – {path.validTo ? formatDate(path.validTo, locale) : t('alerts.unbounded')}
                  </>
                )}
              </p>
            )}
          </section>
        )
      })}
    </section>
  )
}
