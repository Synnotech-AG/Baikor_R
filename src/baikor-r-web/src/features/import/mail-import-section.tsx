import { Alert, App as AntApp, Button, Card, Modal, Popconfirm, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../api/errors'
import {
  checkMailImportNow,
  getMailImportHistory,
  getMailImportSettings,
  getMailImportStatus,
  saveMailImportSettings,
  testMailImportConnection,
} from './mail-import-api'
import { MailImportHistory } from './mail-import-history'
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
} from './mail-import-types'

interface MailImportSectionProps {
  canAdmin: boolean
  antiforgeryReady: boolean
}

function mailErrorKey(caught: unknown) {
  return parseApiError(caught, '').errorKey ?? 'mailImport.failed'
}

export function MailImportSection({ canAdmin, antiforgeryReady }: MailImportSectionProps) {
  const { t, i18n } = useTranslation()
  const { message } = AntApp.useApp()
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<MailImportSettings | null>(null)
  const [draft, setDraft] = useState<MailImportDraft | null>(null)
  const [statusErrorKey, setStatusErrorKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<MailImportHistoryPage | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const describeError = (key: string) => (i18n.exists(key) ? t(key) : t('mailImport.failed'))

  useEffect(() => {
    if (!canAdmin) {
      return
    }
    const controller = new AbortController()
    let running = false
    async function loadHistory() {
      if (running) {
        return
      }
      running = true
      try {
        const result = await getMailImportHistory(page, controller.signal)
        if (!controller.signal.aborted) {
          setHistory(result)
          setHistoryError(null)
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setHistoryError(mailErrorKey(caught))
        }
      } finally {
        running = false
      }
    }
    void loadHistory()
    const timer = window.setInterval(loadHistory, 10000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [canAdmin, page])

  useEffect(() => {
    if (!canAdmin || !open) {
      return
    }
    const controller = new AbortController()
    getMailImportSettings(controller.signal)
      .then((saved) => {
        if (!controller.signal.aborted) {
          setSettings(saved)
          setDraft(toMailImportDraft(saved))
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(mailErrorKey(caught))
        }
      })
    getMailImportStatus(controller.signal)
      .then((status) => {
        if (!controller.signal.aborted) {
          setStatusErrorKey(status.errorKey)
        }
      })
      .catch(() => {
        // The form remains usable when worker diagnostics are unavailable.
      })
    return () => controller.abort()
  }, [canAdmin, open])

  if (!canAdmin) {
    return null
  }
  const close = () => {
    setOpen(false)
    setDraft(null)
    setSettings(null)
    setError(null)
    setStatusErrorKey(null)
  }
  const run = async (action: () => Promise<void>, successKey: string) => {
    if (!antiforgeryReady || busy) {
      return
    }
    setError(null)
    setBusy(true)
    try {
      await action()
      void message.success(t(successKey))
    } catch (caught) {
      setError(mailErrorKey(caught))
    } finally {
      setBusy(false)
    }
  }
  const save = (resetCursor = false) => {
    if (!draft || !settings) {
      return
    }
    const validation = validateMailImportDraft(draft, settings.hasPassword)
    if (validation) {
      setError(validation)
      return
    }
    void run(async () => {
      await saveMailImportSettings({ ...toMailImportRequest(draft), resetCursor })
      close()
    }, 'mailImport.saved')
  }
  const testConnection = () => {
    if (!draft || !settings) {
      return
    }
    const validation = validateMailImportDraft(draft, settings.hasPassword)
    if (validation) {
      setError(validation)
      return
    }
    void run(async () => {
      const tested = await testMailImportConnection(
        toMailImportTestRequest(draft, settings.hasPassword),
      )
      if (!tested.connected) {
        throw new Error('Mailbox connection failed')
      }
    }, 'mailImport.testSucceeded')
  }
  const issueKey =
    settings && !settings.encryptionConfigured ? 'mailImport.keyMissing' : statusErrorKey
  return (
    <Card
      className="mail-import-card"
      title={t('mailImport.title')}
      extra={<Button onClick={() => setOpen(true)}>{t('mailImport.settings')}</Button>}
    >
      {historyError && <Alert type="error" showIcon title={describeError(historyError)} />}
      <MailImportHistory
        history={history}
        page={page}
        loading={!historyError && history?.page !== page}
        onPage={setPage}
      />
      <Modal
        title={t('mailImport.dialogTitle')}
        open={open}
        onCancel={close}
        closable={!busy}
        mask={{ closable: !busy }}
        keyboard={!busy}
        footer={null}
        destroyOnHidden
        width={520}
      >
        {error && <Alert type="error" showIcon title={describeError(error)} />}
        {issueKey && !error && (
          <Alert
            type="warning"
            showIcon
            title={describeError(issueKey)}
            action={
              issueKey === 'mailImport.uidValidityChanged' &&
              draft?.enabled && (
                <Popconfirm
                  title={t('mailImport.resetTitle')}
                  description={t('mailImport.resetDescription')}
                  okText={t('mailImport.startFromNow')}
                  cancelText={t('mailImport.cancel')}
                  onConfirm={() => save(true)}
                >
                  <Button disabled={!antiforgeryReady || busy}>
                    {t('mailImport.startFromNow')}
                  </Button>
                </Popconfirm>
              )
            }
          />
        )}
        {!draft && !error && <Spin />}
        {draft && settings && (
          <MailImportSettingsForm
            draft={draft}
            saved={settings}
            ready={antiforgeryReady}
            busy={busy}
            onChange={(next) => {
              setDraft(next)
              setError(null)
            }}
            onSave={() => save()}
            onTest={testConnection}
            onCheck={() => {
              void run(checkMailImportNow, 'mailImport.checkScheduled')
            }}
          />
        )}
      </Modal>
    </Card>
  )
}
