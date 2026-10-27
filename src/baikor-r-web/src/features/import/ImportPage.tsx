import { FileZipOutlined, InboxOutlined } from '@ant-design/icons'
import { Alert, App as AntApp, Button, Card, Collapse, Descriptions, Space, Statistic, Typography, Upload } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImportTrenchesEndpoint } from '../../api/endpoints/useImportTrenchesEndpoint'
import type { ImportTrenchesResponse } from '../../api/endpoints/useImportTrenchesEndpoint'
import { parseApiError } from '../../api/errors'

interface ImportPageProps {
  enabled: boolean
  onViewSites?: () => void
}

export function ImportPage({ enabled, onViewSites }: ImportPageProps) {
  const { t, i18n } = useTranslation()
  const { notification } = AntApp.useApp()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportTrenchesResponse | null>(null)
  const { execute: importTrenches, isLoading } = useImportTrenchesEndpoint()

  const describeWarning = (warning: string) => {
    if (warning === 'The source contains line geometries without a construction width; each line was buffered using the configured area buffer.') {
      return t('importUx.warnings.buffered')
    }
    const skipped = warning.match(/^(\d+) house-connection features were skipped because they do not affect public space\.$/)
    if (skipped) {
      return t('importUx.warnings.skipped', { count: Number(skipped[1]) })
    }
    if (warning === "Source statuses 'Executed' and 'Documented' are mapped to Active. 'Canceled' is mapped to Draft and retained in metadata.") {
      return t('importUx.warnings.statuses', {
        active: t('constructionSites.status.active'),
        draft: t('constructionSites.status.draft'),
      })
    }
    return warning
  }

  const importFile = async () => {
    if (!file || !enabled) return
    try {
      const imported = await importTrenches(file)
      setResult(imported)
      setFile(null)
      notification.success({ message: t('import.success', { count: imported.createdCount }) })
    } catch (error) {
      const parsed = parseApiError(error, t('import.failed'))
      const message = parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
      notification.error({ message })
    }
  }

  return (
    <main className="import-page">
      <Card className="import-card" bordered>
        <div className="import-card-icon" aria-hidden><InboxOutlined /></div>
        <div className="import-content">
          <Typography.Title level={2}>{t('import.title')}</Typography.Title>
          <Typography.Paragraph>{t('import.message')}</Typography.Paragraph>
          <Typography.Paragraph type="secondary">{t('import.trenches.explanation')}</Typography.Paragraph>
          <Upload.Dragger
            className="trench-import-dropzone"
            accept=".zip,application/zip"
            disabled={!enabled || isLoading}
            maxCount={1}
            showUploadList={false}
            beforeUpload={(candidate) => {
              setFile(candidate)
              setResult(null)
              return Upload.LIST_IGNORE
            }}
          >
            <p className="ant-upload-drag-icon"><FileZipOutlined /></p>
            <p className="ant-upload-text">{t('import.trenches.drop')}</p>
            <p className="ant-upload-hint">{t('import.trenches.formats')}</p>
          </Upload.Dragger>
          <div className="import-actions">
            <span className="import-selected-file">{file ? file.name : t('import.trenches.noFile')}</span>
            <Button
              type="primary"
              disabled={!file || !enabled}
              loading={isLoading}
              onClick={() => { void importFile() }}
            >
              {t('import.action')}
            </Button>
          </div>
          {result && (
            <Card size="small" className="import-result" title={t('import.result')}>
              <Typography.Paragraph>{t('importUx.saved')}</Typography.Paragraph>
              <div className="import-result-summary" aria-live="polite">
                <Statistic title={t('importUx.created')} value={result.createdCount} />
                <Statistic title={t('importUx.skipped')} value={result.skippedCount} />
              </div>
              {result.warnings.length > 0 && (
                <Alert
                  className="import-result-notes"
                  type="warning"
                  showIcon
                  title={t('importUx.notes')}
                  description={(
                    <ul>
                      {result.warnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>{describeWarning(warning)}</li>
                      ))}
                    </ul>
                  )}
                />
              )}
              {onViewSites && (
                <div className="import-result-actions">
                  <Button type="primary" onClick={onViewSites}>{t('importUx.viewSites')}</Button>
                  <Typography.Text type="secondary">{t('importUx.viewSitesHint')}</Typography.Text>
                </div>
              )}
              <Collapse
                className="import-result-details"
                ghost
                items={[{
                  key: 'details',
                  label: t('importUx.details'),
                  children: (
                    <>
                      <Descriptions size="small" column={1}>
                        <Descriptions.Item label={t('import.project')}>{result.sourceProjectId}</Descriptions.Item>
                        <Descriptions.Item label={t('import.batch')}>{result.batchId}</Descriptions.Item>
                        <Descriptions.Item label={t('importUx.features')}>{result.featureCount}</Descriptions.Item>
                      </Descriptions>
                      <Typography.Paragraph strong>{t('importUx.sourceStatuses')}</Typography.Paragraph>
                      <Space size={[8, 4]} wrap>
                        {Object.entries(result.createdBySourceStatus).map(([status, count]) => (
                          <Typography.Text type="secondary" key={status}>{status}: {count}</Typography.Text>
                        ))}
                      </Space>
                    </>
                  ),
                }]}
              />
            </Card>
          )}
        </div>
      </Card>
    </main>
  )
}
