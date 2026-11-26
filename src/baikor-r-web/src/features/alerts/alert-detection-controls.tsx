import { Button } from 'antd'
import { useTranslation } from 'react-i18next'

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
