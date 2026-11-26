import { Alert, Button, Checkbox, Input, InputNumber, Select, Space, Switch } from 'antd'
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
}

export function MailImportSettingsForm({
  draft,
  saved,
  ready,
  busy,
  onChange,
  onSave,
  onTest,
}: MailImportSettingsProps) {
  const { t } = useTranslation()
  const disabled = !ready || busy
  const sourceDisabled = disabled || saved.enabled
  return (
    <form
      className="mail-import-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <Alert type="info" showIcon title={t('mailImport.newOnly')} />
      {saved.enabled && <Alert type="info" title={t('mailImport.sourceLocked')} />}
      <label>
        <Switch
          checked={draft.enabled}
          disabled={disabled || !saved.encryptionConfigured || draft.clearPassword}
          onChange={(enabled) => onChange({ ...draft, enabled })}
        />{' '}
        {t('mailImport.enabled')}
      </label>
      <label htmlFor="mail-import-host">{t('mailImport.host')}</label>
      <Input
        id="mail-import-host"
        value={draft.host}
        maxLength={253}
        disabled={sourceDisabled}
        onChange={(event) => onChange({ ...draft, host: event.target.value })}
      />
      <div className="mail-import-form-row">
        <div>
          <label htmlFor="mail-import-port">{t('mailImport.port')}</label>
          <InputNumber
            id="mail-import-port"
            min={1}
            max={65535}
            value={draft.port}
            disabled={sourceDisabled}
            onChange={(port) => onChange({ ...draft, port: port ?? 0 })}
          />
        </div>
        <div>
          <label htmlFor="mail-import-security">{t('mailImport.security')}</label>
          <Select
            id="mail-import-security"
            value={draft.security}
            disabled={sourceDisabled}
            onChange={(security) => onChange({ ...draft, security })}
            options={[
              { value: 'sslOnConnect', label: t('mailImport.sslOnConnect') },
              { value: 'startTls', label: t('mailImport.startTls') },
            ]}
          />
        </div>
      </div>
      <label htmlFor="mail-import-username">{t('mailImport.username')}</label>
      <Input
        id="mail-import-username"
        autoComplete="off"
        value={draft.username}
        maxLength={320}
        disabled={sourceDisabled}
        onChange={(event) => onChange({ ...draft, username: event.target.value })}
      />
      <label htmlFor="mail-import-password">{t('mailImport.password')}</label>
      <Input.Password
        id="mail-import-password"
        autoComplete="new-password"
        value={draft.password}
        disabled={disabled || draft.clearPassword || !saved.encryptionConfigured}
        onChange={(event) => onChange({ ...draft, password: event.target.value })}
      />
      <small>
        {t(saved.hasPassword ? 'mailImport.passwordSaved' : 'mailImport.passwordEmpty')}
      </small>
      {saved.hasPassword && (
        <Checkbox
          checked={draft.clearPassword}
          disabled={disabled || saved.enabled || draft.enabled || draft.password.length > 0}
          onChange={(event) => onChange({ ...draft, clearPassword: event.target.checked })}
        >
          {t('mailImport.clearPassword')}
        </Checkbox>
      )}
      <label htmlFor="mail-import-folder">{t('mailImport.folder')}</label>
      <Input
        id="mail-import-folder"
        value={draft.folder}
        maxLength={512}
        disabled={sourceDisabled}
        onChange={(event) => onChange({ ...draft, folder: event.target.value })}
      />
      <div className="mail-import-form-row">
        <div>
          <label htmlFor="mail-import-interval">{t('mailImport.interval')}</label>
          <InputNumber
            id="mail-import-interval"
            min={30}
            max={3600}
            precision={0}
            value={draft.pollIntervalSeconds}
            disabled={disabled}
            onChange={(value) => onChange({ ...draft, pollIntervalSeconds: value ?? 0 })}
          />
        </div>
        <div>
          <label htmlFor="mail-import-buffer">{t('mailImport.buffer')}</label>
          <InputNumber
            id="mail-import-buffer"
            min={0.1}
            max={20}
            step={0.1}
            value={draft.bufferMetres}
            disabled={disabled}
            onChange={(value) => onChange({ ...draft, bufferMetres: value ?? 0 })}
          />
        </div>
      </div>
      <Space wrap>
        <Button htmlType="submit" type="primary" disabled={disabled} loading={busy}>
          {t('mailImport.save')}
        </Button>
        <Button disabled={disabled || !saved.encryptionConfigured} onClick={onTest}>
          {t('mailImport.test')}
        </Button>
      </Space>
    </form>
  )
}
