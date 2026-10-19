import { FileZipOutlined, InboxOutlined } from '@ant-design/icons'
import { App as AntApp, Button, Card, Descriptions, Space, Typography, Upload } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImportTrenchesEndpoint } from '../../api/endpoints/useImportTrenchesEndpoint'
import type { ImportTrenchesResponse } from '../../api/endpoints/useImportTrenchesEndpoint'
import { parseApiError } from '../../api/errors'

interface ImportPageProps {
  enabled: boolean
}

export function ImportPage({ enabled }: ImportPageProps) {
  const { t, i18n } = useTranslation()
  const { notification } = AntApp.useApp()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportTrenchesResponse | null>(null)
  const { execute: importTrenches, isLoading } = useImportTrenchesEndpoint()

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
              <Descriptions size="small" column={2}>
                <Descriptions.Item label={t('import.project')}>{result.sourceProjectId}</Descriptions.Item>
                <Descriptions.Item label={t('import.batch')}>{result.batchId}</Descriptions.Item>
                <Descriptions.Item label={t('import.features')}>{result.featureCount}</Descriptions.Item>
                <Descriptions.Item label={t('import.skipped')}>{result.skippedCount}</Descriptions.Item>
                <Descriptions.Item label={t('import.created')}>{result.createdCount}</Descriptions.Item>
              </Descriptions>
              <Space size={[8, 4]} wrap>
                {Object.entries(result.createdBySourceStatus).map(([status, count]) => (
                  <Typography.Text type="secondary" key={status}>{status}: {count}</Typography.Text>
                ))}
              </Space>
            </Card>
          )}
        </div>
      </Card>
    </main>
  )
}
