import { Button, Checkbox, Input, InputNumber, Select, Switch } from 'antd'
import { useTranslation } from 'react-i18next'
import type { MailImportDraft, MailImportSettings } from './mail-import-types'

interface MailImportSettingsProps {
  draft: MailImportDraft
  saved: MailImportSettings
  ready: boolean
  busy: boolean
  onChange: (draft: MailImportDraft) => void
  onSave: () => void
  onTest: () => void
  onCheck: () => void
}

export function MailImportSettingsForm({
  draft,
  saved,
  ready,
  busy,
  onChange,
  onSave,
  onTest,
  onCheck,
}: MailImportSettingsProps) {
  const { t } = useTranslation()
  const connectionChanged =
    draft.host.trim().toLowerCase() !== saved.host.toLowerCase() ||
    draft.port !== saved.port ||
    draft.security !== saved.security ||
    draft.username.trim() !== saved.username
  const canCheckSaved =
    saved.enabled &&
    draft.enabled &&
    !connectionChanged &&
    draft.folder.trim() === saved.folder &&
    !draft.password &&
    !draft.clearPassword
  const actionsDisabled = !ready || busy
  return (
    <form
      className="mail-import-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!actionsDisabled) {
          onSave()
        }
      }}
    >
      <div className="mail-import-field">
        <label htmlFor="mail-import-host">{t('mailImport.host')}</label>
        <Input
          id="mail-import-host"
          value={draft.host}
          maxLength={253}
          disabled={busy}
          onChange={(event) => onChange({ ...draft, host: event.target.value })}
        />
      </div>
      <div className="mail-import-form-row">
        <div className="mail-import-field">
          <label htmlFor="mail-import-security">{t('mailImport.security')}</label>
          <Select
            id="mail-import-security"
            value={draft.security}
            disabled={busy}
            onChange={(security) => onChange({ ...draft, security })}
            options={[
              { value: 'sslOnConnect', label: t('mailImport.sslOnConnect') },
              { value: 'startTls', label: 'STARTTLS' },
            ]}
          />
        </div>
        <div className="mail-import-field">
          <label htmlFor="mail-import-port">{t('mailImport.port')}</label>
          <InputNumber
            id="mail-import-port"
            min={1}
            max={65535}
            value={draft.port}
            disabled={busy}
            onChange={(port) => onChange({ ...draft, port: port ?? 0 })}
          />
        </div>
      </div>
      <div className="mail-import-form-row">
        <div className="mail-import-field">
          <label htmlFor="mail-import-username">{t('mailImport.username')}</label>
          <Input
            id="mail-import-username"
            autoComplete="off"
            value={draft.username}
            maxLength={320}
            disabled={busy}
            onChange={(event) => onChange({ ...draft, username: event.target.value })}
          />
        </div>
        <div className="mail-import-field">
          <label htmlFor="mail-import-password">{t('mailImport.password')}</label>
          <Input.Password
            id="mail-import-password"
            autoComplete="new-password"
            value={draft.password}
            placeholder={
              saved.hasPassword && !connectionChanged && !draft.clearPassword
                ? t('mailImport.passwordSaved')
                : undefined
            }
            disabled={busy || draft.clearPassword || !saved.encryptionConfigured}
            onChange={(event) => onChange({ ...draft, password: event.target.value })}
          />
          {saved.hasPassword && !draft.enabled && (
            <Checkbox
              checked={draft.clearPassword}
              disabled={busy || !!draft.password}
              onChange={(event) => onChange({ ...draft, clearPassword: event.target.checked })}
            >
              {t('mailImport.clearPassword')}
            </Checkbox>
          )}
        </div>
      </div>
      <div className="mail-import-field">
        <label htmlFor="mail-import-folder">{t('mailImport.folder')}</label>
        <Input
          id="mail-import-folder"
          value={draft.folder}
          maxLength={512}
          disabled={busy}
          onChange={(event) => onChange({ ...draft, folder: event.target.value })}
        />
      </div>
      <div className="mail-import-enable">
        <label htmlFor="mail-import-enabled">{t('mailImport.enabled')}</label>
        <Switch
          id="mail-import-enabled"
          checked={draft.enabled}
          disabled={busy || !saved.encryptionConfigured || draft.clearPassword}
          onChange={(enabled) => onChange({ ...draft, enabled })}
        />
      </div>
      <div className="mail-import-form-actions">
        <Button disabled={actionsDisabled || !saved.encryptionConfigured} onClick={onTest}>
          {t('mailImport.test')}
        </Button>
        <Button
          disabled={actionsDisabled || !saved.encryptionConfigured || !canCheckSaved}
          onClick={onCheck}
        >
          {t('mailImport.checkNow')}
        </Button>
        <Button htmlType="submit" type="primary" disabled={actionsDisabled}>
          {t('mailImport.save')}
        </Button>
      </div>
    </form>
  )
}
