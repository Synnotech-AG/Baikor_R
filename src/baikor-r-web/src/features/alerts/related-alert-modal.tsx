import { Alert, Modal, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../api/errors'
import { getAlert, getAlertEvidence } from './api'
import { AlertDetailsPane } from './alert-details-pane'
import { toHistoricalAlert } from './alert-model'
import type { AlertDetails, AlertSelectionOrigin } from './types'

interface RelatedAlertModalProps {
  alertId: string | null
  onClose: () => void
  onOpenRelatedAlert: (id: string) => void
  onOpenCanonical: (id: string) => void
  onFocus: (alert: AlertDetails, origin?: AlertSelectionOrigin) => void
  onOpenConstructionSite: (id: string, alert?: AlertDetails) => void
  onOpenRoute: (id: string) => void
}

export function RelatedAlertModal({
  alertId,
  onClose,
  onOpenRelatedAlert,
  onOpenCanonical,
  onFocus,
  onOpenConstructionSite,
  onOpenRoute,
}: RelatedAlertModalProps) {
  const { t, i18n } = useTranslation()
  const [alert, setAlert] = useState<AlertDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState<number | null>(null)
  const [historical, setHistorical] = useState<AlertDetails | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  useEffect(() => {
    setAlert(null)
    setError(null)
    setRevision(null)
    setHistorical(null)
    if (!alertId) {
      return
    }
    const controller = new AbortController()
    void getAlert(alertId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setAlert(result)
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          const parsed = parseApiError(caught, t('alerts.failed'))
          setError(
            parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message,
          )
        }
      })
    return () => controller.abort()
  }, [alertId, t, i18n])
  useEffect(() => {
    setHistorical(null)
    setHistoryError(null)
    if (!alert || revision === null) {
      return
    }
    const controller = new AbortController()
    void getAlertEvidence(alert.id, revision, controller.signal)
      .then((evidence) => {
        if (!controller.signal.aborted) {
          setHistorical(toHistoricalAlert(alert, evidence))
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setHistoryError(parseApiError(caught, t('alerts.failed')).message)
        }
      })
    return () => controller.abort()
  }, [alert, revision, t])
  const shared = { canReview: false, saving: false, onFocus, onOpenConstructionSite, onOpenRoute }
  return (
    <>
      <Modal
        title={t('alerts.relatedCase')}
        open={alertId !== null}
        onCancel={onClose}
        footer={null}
        width={760}
        destroyOnHidden
      >
        {error ? (
          <Alert type="error" showIcon title={error} />
        ) : alert ? (
          <div className="alert-historical-details">
            <AlertDetailsPane
              {...shared}
              alert={alert}
              readOnly
              onViewEvidence={setRevision}
              onOpenRelatedAlert={onOpenRelatedAlert}
              onOpenCanonical={onOpenCanonical}
            />
          </div>
        ) : (
          <Spin />
        )}
      </Modal>
      <Modal
        title={t('alerts.historicalEvidence')}
        open={revision !== null}
        onCancel={() => setRevision(null)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        {historyError ? (
          <Alert type="error" showIcon title={historyError} />
        ) : historical ? (
          <div className="alert-historical-details">
            <AlertDetailsPane {...shared} alert={historical} historical />
          </div>
        ) : (
          <Spin />
        )}
      </Modal>
    </>
  )
}
