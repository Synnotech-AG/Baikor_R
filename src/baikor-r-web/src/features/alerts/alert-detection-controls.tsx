import { Alert, Button, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { detectionHealth, hasIncompleteDetectionCoverage } from './alert-model'
import type { DetectionStatus } from './types'

export function AlertDetectionHealth({
  status,
  unavailable = false,
}: {
  status: DetectionStatus | null
  unavailable?: boolean
}) {
  const { t } = useTranslation()
  const health = detectionHealth(status)
  const incomplete = hasIncompleteDetectionCoverage(status)
  if (!unavailable && health === 'current' && !incomplete) {
    return null
  }
  const pausedTypes = (status?.pausedTypes ?? [])
    .map((type) => (type === 'routeConflict' ? t('alerts.routeConflict') : type))
    .join(', ')
  const message = unavailable
    ? t('alerts.status.unavailable')
    : health === 'current'
      ? null
      : t(`alerts.status.${health}`, {
          count: health === 'failed' ? status?.failedCount : status?.pendingCount,
          types: pausedTypes,
        })
  return (
    <div className="alert-health" aria-live="polite">
      {(unavailable || health !== 'current') && (
        <Alert
          showIcon
          type={health === 'pending' && !unavailable ? 'info' : 'warning'}
          title={message}
        />
      )}
      {pausedTypes && (health !== 'paused' || unavailable) && (
        <Tag color="orange">{t('alerts.status.paused', { types: pausedTypes })}</Tag>
      )}
      {health === 'paused' && Boolean(status?.pendingCount) && (
        <Tag color="blue">{t('alerts.status.pending', { count: status?.pendingCount })}</Tag>
      )}
      {incomplete && (
        <Alert
          className="alert-coverage-warning"
          type="warning"
          showIcon
          title={t('alerts.status.incompleteCoverage', { count: status?.unassessableSiteCount })}
        />
      )}
    </div>
  )
}

export function AlertRecheckAction({
  canAdmin,
  ready,
  pending,
  loading,
  onStart,
}: {
  canAdmin: boolean
  ready: boolean
  pending: boolean
  loading: boolean
  onStart: () => void
}) {
  const { t } = useTranslation()
  if (!canAdmin) {
    return null
  }
  return (
    <Button
      disabled={!ready || pending || loading}
      loading={loading}
      onClick={() => {
        if (ready && !pending && !loading) {
          onStart()
        }
      }}
    >
      {t(pending || loading ? 'alerts.rechecking' : 'alerts.recheck')}
    </Button>
  )
}
