import { FileZipOutlined } from '@ant-design/icons'
import { Alert, Button, Upload } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../api/errors'
import { useImportRoutesEndpoint } from './api'
import {
  routeImportFileError,
  routeImportWarningKey,
  routeImportWarnings,
} from './route-import-model'
import type { RouteImportResult } from './types'

interface RouteImportProps {
  enabled: boolean
  onChanged: () => void
  onCancel: () => void
  onBusyChange?: (busy: boolean) => void
}

interface RouteImportViewProps {
  enabled: boolean
  loading: boolean
  file: File | null
  result: RouteImportResult | null
  error: string | null
  onSelectFile: (file: File) => void
  onImport: () => void
  onCancel: () => void
}

export function RouteImport({ enabled, onChanged, onCancel, onBusyChange }: RouteImportProps) {
  const { t, i18n } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<RouteImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)
  const endpoint = useImportRoutesEndpoint()

  useEffect(() => {
    onBusyChange?.(endpoint.isLoading)
  }, [endpoint.isLoading, onBusyChange])

  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  const selectFile = (candidate: File) => {
    if (!enabled || pendingRef.current) {
      return
    }
    const errorKey = routeImportFileError(candidate)
    setFile(errorKey ? null : candidate)
    setResult(null)
    setError(errorKey ? t(errorKey) : null)
  }

  const run = async () => {
    if (!enabled || !file || pendingRef.current) {
      return
    }
    pendingRef.current = true
    setError(null)
    try {
      const imported = await endpoint.execute(file)
      setResult(imported)
      setFile(null)
      onChanged()
    } catch (caught) {
      const parsed = parseApiError(caught, t('routes.importFailed'))
      setError(
        parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message,
      )
    } finally {
      pendingRef.current = false
    }
  }

  return (
    <RouteImportView
      enabled={enabled}
      loading={endpoint.isLoading}
      file={file}
      result={result}
      error={error}
      onSelectFile={selectFile}
      onImport={() => {
        void run()
      }}
      onCancel={onCancel}
    />
  )
}

export function RouteImportView({
  enabled,
  loading,
  file,
  result,
  error,
  onSelectFile,
  onImport,
  onCancel,
}: RouteImportViewProps) {
  const { t } = useTranslation()
  const warnings = routeImportWarnings(result?.warnings ?? [])
  return (
    <section className="route-import">
      {!result && (
        <>
          <Upload.Dragger
            className="route-import-dropzone"
            accept=".zip,application/zip"
            maxCount={1}
            showUploadList={false}
            disabled={!enabled || loading}
            beforeUpload={(candidate) => {
              if (enabled && !loading) {
                onSelectFile(candidate)
              }
              return Upload.LIST_IGNORE
            }}
          >
            <p className="ant-upload-drag-icon">
              <FileZipOutlined />
            </p>
            <p className="ant-upload-text">{t('routes.importDrop')}</p>
            <p className="ant-upload-hint">{t('routes.importFormats')}</p>
          </Upload.Dragger>
          <p className="route-file-name">{file ? file.name : t('routes.importNoFile')}</p>
        </>
      )}
      {error && <Alert type="error" showIcon title={error} />}
      {result && (
        <div className="route-import-result" aria-live="polite">
          <Alert type="success" showIcon title={t('routes.importDone')} />
          <div className="route-import-summary-scroll">
            <table className="route-import-summary" aria-label={t('routes.importDone')}>
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">{t('routes.created')}</th>
                  <th scope="col">{t('routes.updated')}</th>
                  <th scope="col">{t('routes.unchanged')}</th>
                  <th scope="col">{t('routes.suppressed')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{t('routes.parentCounts')}</th>
                  <td>{result.createdCount}</td>
                  <td>{result.updatedCount}</td>
                  <td>{result.unchangedCount}</td>
                  <td>{result.suppressedCount}</td>
                </tr>
                <tr>
                  <th scope="row">{t('routes.pathCount', { count: result.pathCount })}</th>
                  <td>{result.createdPathCount}</td>
                  <td>{result.updatedPathCount}</td>
                  <td>{result.unchangedPathCount}</td>
                  <td>{result.suppressedPathCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              title={t('routes.importWarnings')}
              description={
                <ul>
                  {warnings.map((warning, index) => {
                    const messageKey = routeImportWarningKey(warning)
                    return (
                      <li key={`${index}-${warning}`}>{messageKey ? t(messageKey) : warning}</li>
                    )
                  })}
                </ul>
              }
            />
          )}
        </div>
      )}
      <div className="route-import-actions">
        <Button disabled={loading} onClick={onCancel}>
          {t(result ? 'routes.importClose' : 'common.cancel')}
        </Button>
        {!result && (
          <Button
            type="primary"
            loading={loading}
            disabled={!enabled || !file || loading}
            onClick={() => {
              if (enabled && file && !loading) {
                onImport()
              }
            }}
          >
            {t('routes.importAction')}
          </Button>
        )}
      </div>
    </section>
  )
}
