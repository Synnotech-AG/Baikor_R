import { Alert, Button, Card, Modal, Spin, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../api/errors'
import {
  checkMailImportNow,
  getMailImportHistory,
  getMailImportSettings,
  getMailImportStatus,
  retryMailImport,
  saveMailImportSettings,
  testMailImportConnection,
} from './mail-import-api'
import { MailImportControls, MailImportHistory } from './mail-import-controls'
import {
  toMailImportDraft,
  toMailImportRequest,
  toMailImportTestRequest,
  validateMailImportDraft,
} from './mail-import-model'
import { MailImportSettingsForm } from './mail-import-settings'
import type {
  MailImportDraft,
  MailImportHistoryPage,
  MailImportSettings,
  MailImportStatus,
} from './mail-import-types'

interface MailImportSectionProps {
  canAdmin: boolean
  antiforgeryReady: boolean
}

export function MailImportSection({ canAdmin, antiforgeryReady }: MailImportSectionProps) {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<MailImportSettings | null>(null)
  const [status, setStatus] = useState<MailImportStatus | null>(null)
  const [history, setHistory] = useState<MailImportHistoryPage | null>(null)
  const [draft, setDraft] = useState<MailImportDraft | null>(null)
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const describeError = useCallback(
    (caught: unknown) => {
      const parsed = parseApiError(caught, '')
      return parsed.errorKey && i18n.exists(parsed.errorKey)
        ? t(parsed.errorKey)
        : t('mailImport.failed')
    },
    [i18n, t],
  )

  useEffect(() => {
    if (!canAdmin) {
      return
    }
    const controller = new AbortController()
    let running = false
    const load = async () => {
      if (running) {
        return
      }
      running = true
      try {
        const [nextSettings, nextStatus, nextHistory] = await Promise.all([
          getMailImportSettings(controller.signal),
          getMailImportStatus(controller.signal),
          getMailImportHistory(page, controller.signal),
        ])
        if (!controller.signal.aborted) {
          setSettings(nextSettings)
          setStatus(nextStatus)
          setHistory(nextHistory)
          setLoadError(null)
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setLoadError(describeError(caught))
        }
      } finally {
        running = false
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 10000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [canAdmin, page, refresh, describeError])

  if (!canAdmin) {
    return null
  }
  const writable = antiforgeryReady && !busy && settings !== null
  const run = async (action: () => Promise<void>, successKey: string) => {
    if (!writable) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(t(successKey))
      setRefresh((value) => value + 1)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    if (!draft || !settings || !writable) {
      return
    }
    const validation = validateMailImportDraft(draft, settings.hasPassword)
    if (validation) {
      setError(t(validation))
      return
    }
    await run(async () => {
      setSettings(await saveMailImportSettings(toMailImportRequest(draft)))
      setDraft(null)
    }, 'mailImport.saved')
  }
  const testConnection = async () => {
    if (!draft || !settings || !writable) {
      return
    }
    const validation = validateMailImportDraft(draft, settings.hasPassword)
    if (validation) {
      setError(t(validation))
      return
    }
    await run(async () => {
      const tested = await testMailImportConnection(
        toMailImportTestRequest(draft, settings.hasPassword),
      )
      if (!tested.connected) {
        throw new Error('Connection test failed')
      }
    }, 'mailImport.testSucceeded')
  }
  const changeEnabled = (resetCursor = false) => {
    if (!settings) {
      return
    }
    const next = {
      ...toMailImportDraft(settings),
      enabled: resetCursor || !settings.enabled,
      resetCursor,
    }
    const validation = validateMailImportDraft(next, settings.hasPassword)
    if (validation) {
      setError(t(validation))
      setDraft(next)
      return
    }
    void run(async () => {
      setSettings(await saveMailImportSettings(toMailImportRequest(next)))
    }, 'mailImport.saved')
  }
  const statusError = status?.errorKey
    ? i18n.exists(status.errorKey)
      ? t(status.errorKey)
      : t('mailImport.failed')
    : null
  return (
    <Card
      className="mail-import-card"
      title={t('mailImport.title')}
      extra={
        <Button onClick={() => setRefresh((value) => value + 1)} disabled={busy}>
          {t('mailImport.refresh')}
        </Button>
      }
    >
      <Typography.Paragraph>{t('mailImport.description')}</Typography.Paragraph>
      {loading && <Spin tip={t('mailImport.loading')} />}
      {loadError && <Alert type="error" showIcon title={loadError} />}
      {!draft && error && <Alert type="error" showIcon title={error} />}
      {!draft && notice && <Alert type="success" showIcon title={notice} />}
      {settings && !settings.encryptionConfigured && (
        <Alert type="warning" showIcon title={t('mailImport.keyMissing')} />
      )}
      {statusError && <Alert type="error" showIcon title={statusError} />}
      <MailImportControls
        canAdmin={canAdmin}
        ready={antiforgeryReady}
        busy={busy}
        settings={settings}
        status={status}
        onSettings={() => {
          if (settings) {
            setError(null)
            setNotice(null)
            setDraft(toMailImportDraft(settings))
          }
        }}
        onCheck={() => {
          void run(checkMailImportNow, 'mailImport.checkScheduled')
        }}
        onToggle={() => changeEnabled()}
        onReset={() => changeEnabled(true)}
      />
      <Typography.Title level={4}>{t('mailImport.history')}</Typography.Title>
      <MailImportHistory
        history={history}
        ready={antiforgeryReady && settings?.encryptionConfigured === true}
        busy={busy}
        onPage={setPage}
        onRetry={(id) => {
          void run(() => retryMailImport(id), 'mailImport.retryScheduled')
        }}
      />
      <Modal
        title={t('mailImport.settings')}
        open={draft !== null}
        onCancel={() => {
          if (!busy) {
            setDraft(null)
            setError(null)
            setNotice(null)
          }
        }}
        closable={!busy}
        maskClosable={!busy}
        footer={null}
        destroyOnHidden
        width={640}
      >
        {error && <Alert type="error" showIcon title={error} />}
        {notice && <Alert type="success" showIcon title={notice} />}
        {draft && settings && (
          <MailImportSettingsForm
            draft={draft}
            saved={settings}
            ready={antiforgeryReady}
            busy={busy}
            onChange={(next) => {
              setDraft(next)
              setNotice(null)
            }}
            onSave={() => {
              void save()
            }}
            onTest={() => {
              void testConnection()
            }}
          />
        )}
      </Modal>
    </Card>
  )
}
