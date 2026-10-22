import { App as AntApp, ConfigProvider } from 'antd'
import deDE from 'antd/locale/de_DE'
import enUS from 'antd/locale/en_US'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import 'dayjs/locale/en'
import type { PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'
import { applicationTheme } from '../theme'
import { ServerErrorNotifier } from './ServerErrorNotifier'

export function ApplicationProviders({ children }: PropsWithChildren) {
  const { i18n } = useTranslation()
  const isGerman = i18n.resolvedLanguage?.startsWith('de') ?? true
  dayjs.locale(isGerman ? 'de' : 'en')

  return (
    <ConfigProvider
      locale={isGerman ? deDE : enUS}
      theme={applicationTheme}
    >
      <AntApp>
        <ServerErrorNotifier />
        {children}
      </AntApp>
    </ConfigProvider>
  )
}
