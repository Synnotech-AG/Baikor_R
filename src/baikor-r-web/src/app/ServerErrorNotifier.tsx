import { App as AntApp } from 'antd'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { registerServerErrorListener } from '../api/serverErrorMiddleware'

export function ServerErrorNotifier() {
  const { notification } = AntApp.useApp()
  const { t, i18n } = useTranslation()

  useEffect(() => registerServerErrorListener(({ errorKey, fallbackMessage }) => {
    const translatedMessage = errorKey && i18n.exists(errorKey)
      ? t(errorKey)
      : fallbackMessage || t('error.unexpected')
    notification.error({
      key: 'global-server-error',
      title: t('error.title'),
      description: translatedMessage,
    })
  }), [i18n, notification, t])

  return null
}
