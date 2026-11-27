import { Table } from 'antd'
import { useTranslation } from 'react-i18next'
import { formatTimestamp } from '../../shared/formatters'
import type { MailImportHistoryItem, MailImportHistoryPage } from './mail-import-types'

interface MailImportHistoryProps {
  history: MailImportHistoryPage | null
  loading: boolean
  page: number
  onPage: (page: number) => void
}

export function MailImportHistory({ history, loading, page, onPage }: MailImportHistoryProps) {
  const { t, i18n } = useTranslation()
  return (
    <Table<MailImportHistoryItem>
      size="small"
      className="mail-import-history"
      tableLayout="fixed"
      rowKey="id"
      loading={loading}
      dataSource={history?.items ?? []}
      locale={{ emptyText: t('mailImport.historyEmpty') }}
      columns={[
        {
          title: t('mailImport.filename'),
          dataIndex: 'fileName',
          render: (fileName: string) => <span className="mail-import-file">{fileName}</span>,
        },
        {
          title: t('mailImport.time'),
          dataIndex: 'completedAt',
          width: '32%',
          render: (completedAt: string) => (
            <time dateTime={completedAt}>
              {formatTimestamp(completedAt, i18n.language === 'de' ? 'de-DE' : 'en-GB')}
            </time>
          ),
        },
        {
          title: t('mailImport.result'),
          width: '22%',
          render: (_, item) =>
            t(item.state === 'imported' ? 'mailImport.success' : 'mailImport.failure'),
        },
      ]}
      pagination={{
        current: page,
        pageSize: history?.pageSize ?? 20,
        total: history?.totalCount ?? 0,
        hideOnSinglePage: true,
        showSizeChanger: false,
        onChange: onPage,
      }}
    />
  )
}
