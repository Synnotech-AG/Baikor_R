import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useTranslation } from 'react-i18next'
import { formatTimestamp } from '../../shared/formatters'
import { describeImportWarning } from './import-warning'
import type {
  MailImportHistoryPage,
  MailImportSettings,
  MailImportStatus,
} from './mail-import-types'

interface MailImportControlsProps {
  canAdmin: boolean
  ready: boolean
  busy: boolean
  settings: MailImportSettings | null
  status: MailImportStatus | null
  onSettings: () => void
  onCheck: () => void
  onToggle: () => void
  onReset: () => void
}

export function MailImportControls({
  canAdmin,
  ready,
  busy,
  settings,
  status,
  onSettings,
  onCheck,
  onToggle,
  onReset,
}: MailImportControlsProps) {
  const { t, i18n } = useTranslation()
  if (!canAdmin) {
    return null
  }
  const writable = ready && !busy && settings !== null
  const stateKey = `mailImport.state.${status?.state ?? 'paused'}`
  const timestamp = (value: string | null | undefined) =>
    value ? formatTimestamp(value, i18n.language === 'de' ? 'de-DE' : 'en-GB') : '–'
  return (
    <>
      <Space wrap>
        <Button disabled={!writable} onClick={onSettings}>
          {t('mailImport.settings')}
        </Button>
        <Button
          disabled={!writable || (!settings?.enabled && !settings?.encryptionConfigured)}
          onClick={onToggle}
        >
          {t(settings?.enabled ? 'mailImport.pause' : 'mailImport.resume')}
        </Button>
        <Button
          disabled={!writable || !settings?.enabled || !settings.encryptionConfigured}
          onClick={onCheck}
        >
          {t('mailImport.checkNow')}
        </Button>
        {status?.errorKey?.toLowerCase().includes('uidvalidity') && (
          <Popconfirm
            title={t('mailImport.resetTitle')}
            description={t('mailImport.resetDescription')}
            onConfirm={onReset}
            okText={t('mailImport.startFromNow')}
            cancelText={t('mailImport.cancel')}
          >
            <Button disabled={!writable || !settings?.encryptionConfigured}>
              {t('mailImport.startFromNow')}
            </Button>
          </Popconfirm>
        )}
      </Space>
      <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
        <Descriptions.Item label={t('mailImport.state')}>
          <Tag>{i18n.exists(stateKey) ? t(stateKey) : t('mailImport.unknownState')}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('mailImport.lastChecked')}>
          {timestamp(status?.lastCheckedAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('mailImport.lastSuccess')}>
          {timestamp(status?.lastSuccessAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('mailImport.activatedAt')}>
          {timestamp(status?.activatedAt)}
        </Descriptions.Item>
        <Descriptions.Item label={t('mailImport.pendingCount')}>
          {status?.pendingCount ?? 0}
        </Descriptions.Item>
        <Descriptions.Item label={t('mailImport.failedCount')}>
          {status?.failedCount ?? 0}
        </Descriptions.Item>
      </Descriptions>
    </>
  )
}

interface MailImportHistoryProps {
  history: MailImportHistoryPage | null
  ready: boolean
  busy: boolean
  onPage: (page: number) => void
  onRetry: (id: string) => void
}

export function MailImportHistory({
  history,
  ready,
  busy,
  onPage,
  onRetry,
}: MailImportHistoryProps) {
  const { t, i18n } = useTranslation()
  const timestamp = (value: string) =>
    formatTimestamp(value, i18n.language === 'de' ? 'de-DE' : 'en-GB')
  return (
    <Table
      size="small"
      rowKey="id"
      dataSource={history?.items ?? []}
      scroll={{ x: 600 }}
      locale={{ emptyText: t('mailImport.historyEmpty') }}
      columns={[
        {
          title: t('mailImport.filename'),
          dataIndex: 'fileName',
          render: (fileName: string) => (
            <Typography.Text>{fileName || t('mailImport.noZipAttachment')}</Typography.Text>
          ),
        },
        {
          title: t('mailImport.time'),
          render: (_, item) => (
            <div>
              <div>{timestamp(item.createdAt)}</div>
              {item.completedAt && <small>{timestamp(item.completedAt)}</small>}
            </div>
          ),
        },
        {
          title: t('mailImport.result'),
          render: (_, item) => {
            const stateKey = `mailImport.state.${item.state}`
            return (
              <Space orientation="vertical" size="small">
                <Tag>{i18n.exists(stateKey) ? t(stateKey) : t('mailImport.unknownState')}</Tag>
                {item.createdCount !== null && (
                  <span>{t('mailImport.createdCount', { count: item.createdCount })}</span>
                )}
                <small>{t('mailImport.attempts', { count: item.attempts })}</small>
                {item.errorKey && (
                  <Alert
                    type="warning"
                    showIcon
                    title={i18n.exists(item.errorKey) ? t(item.errorKey) : t('mailImport.failed')}
                  />
                )}
                {item.warnings.length > 0 && (
                  <Collapse
                    ghost
                    size="small"
                    items={[
                      {
                        key: 'warnings',
                        label: t('mailImport.details'),
                        children: (
                          <ul>
                            {item.warnings.map((warning, index) => (
                              <li key={index}>{describeImportWarning(warning, t)}</li>
                            ))}
                          </ul>
                        ),
                      },
                    ]}
                  />
                )}
                {item.canRetry && (
                  <Button disabled={!ready || busy} onClick={() => onRetry(item.id)}>
                    {t('mailImport.retry')}
                  </Button>
                )}
              </Space>
            )
          },
        },
      ]}
      pagination={{
        current: history?.page ?? 1,
        pageSize: history?.pageSize ?? 20,
        total: history?.totalCount ?? 0,
        showSizeChanger: false,
        onChange: onPage,
      }}
    />
  )
}
