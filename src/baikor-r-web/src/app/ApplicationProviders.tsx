import { App as AntApp, ConfigProvider } from 'antd'
import deDE from 'antd/locale/de_DE'
import enUS from 'antd/locale/en_US'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import 'dayjs/locale/en'
import type { PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'
import { ServerErrorNotifier } from './ServerErrorNotifier'

export function ApplicationProviders({ children }: PropsWithChildren) {
  const { i18n } = useTranslation()
  const isGerman = i18n.resolvedLanguage?.startsWith('de') ?? true
  dayjs.locale(isGerman ? 'de' : 'en')

  return (
    <ConfigProvider
      locale={isGerman ? deDE : enUS}
      theme={{
        token: {
          colorPrimary: '#285f48',
          colorInfo: '#285f48',
          colorSuccess: '#6f8422',
          colorError: '#a33d2d',
          borderRadius: 6,
          fontFamily: 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        },
        components: {
          Button: { fontWeight: 650 },
          Table: { headerBg: '#f5f7f4', headerColor: '#67756e', rowHoverBg: '#f1f6f2' },
        },
      }}
    >
      <AntApp>
        <ServerErrorNotifier />
        {children}
      </AntApp>
    </ConfigProvider>
  )
}
