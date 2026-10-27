import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntApp, Button, Card, Empty, Spin, Upload } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeleteConstructionSiteAttachmentEndpoint } from '../../../api/endpoints/useDeleteConstructionSiteAttachmentEndpoint'
import { useDownloadConstructionSiteAttachmentEndpoint } from '../../../api/endpoints/useDownloadConstructionSiteAttachmentEndpoint'
import { useGetConstructionSiteAttachmentsEndpoint } from '../../../api/endpoints/useGetConstructionSiteAttachmentsEndpoint'
import { useUploadConstructionSiteAttachmentEndpoint } from '../../../api/endpoints/useUploadConstructionSiteAttachmentEndpoint'
import { parseApiError } from '../../../api/errors'
import type { ConstructionSiteAttachment } from '../types'
import { ConstructionSiteSectionTitle } from './ConstructionSiteSectionTitle'

interface AttachmentsEditorProps {
  constructionSiteId: string | null
  canEdit: boolean
  showHeading?: boolean
}

function formatFileSize(bytes: number, locale: string) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`
}

export function AttachmentsEditor({ constructionSiteId, canEdit, showHeading = true }: AttachmentsEditorProps) {
  const { t, i18n } = useTranslation()
  const { modal } = AntApp.useApp()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const [attachments, setAttachments] = useState<ConstructionSiteAttachment[]>([])
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const currentSiteRef = useRef(constructionSiteId)
  const loadVersionRef = useRef(0)
  currentSiteRef.current = constructionSiteId
  const { execute: getAttachments } = useGetConstructionSiteAttachmentsEndpoint()
  const { execute: uploadAttachment, isLoading: uploading } = useUploadConstructionSiteAttachmentEndpoint()
  const { execute: downloadAttachment } = useDownloadConstructionSiteAttachmentEndpoint()
  const { execute: deleteAttachment } = useDeleteConstructionSiteAttachmentEndpoint()

  const errorMessage = useCallback((error: unknown, fallbackKey: string) => {
    const parsed = parseApiError(error, t(fallbackKey))
    return parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
  }, [i18n, t])

  const loadAttachments = useCallback(async () => {
    if (!constructionSiteId) return
    const loadVersion = ++loadVersionRef.current
    setLoadingAttachments(true)
    try {
      const loaded = await getAttachments(constructionSiteId)
      if (currentSiteRef.current !== constructionSiteId || loadVersionRef.current !== loadVersion) return
      setAttachments(loaded)
      setLoadFailed(false)
      setFeedback(null)
    } catch (error) {
      if (currentSiteRef.current !== constructionSiteId || loadVersionRef.current !== loadVersion) return
      setLoadFailed(true)
      setFeedback({ type: 'error', message: errorMessage(error, 'record.attachments.loadFailed') })
    } finally {
      if (currentSiteRef.current === constructionSiteId && loadVersionRef.current === loadVersion) {
        setLoadingAttachments(false)
      }
    }
  }, [constructionSiteId, errorMessage, getAttachments])

  useEffect(() => {
    currentSiteRef.current = constructionSiteId
    setAttachments([])
    setFeedback(null)
    setLoadFailed(false)
    setLoadingAttachments(false)
    void loadAttachments()
    return () => {
      currentSiteRef.current = null
      loadVersionRef.current += 1
    }
  }, [constructionSiteId, loadAttachments])

  const upload = async (file: File) => {
    if (!constructionSiteId || !canEdit) return
    try {
      const attachment = await uploadAttachment(constructionSiteId, file)
      if (currentSiteRef.current !== constructionSiteId) return
      setAttachments((current) => [...current, attachment])
      setFeedback({ type: 'success', message: t('record.attachments.uploaded') })
    } catch (error) {
      if (currentSiteRef.current === constructionSiteId) {
        setFeedback({ type: 'error', message: errorMessage(error, 'record.attachments.uploadFailed') })
      }
    }
  }

  const download = async (attachment: ConstructionSiteAttachment) => {
    if (!constructionSiteId) return
    setDownloadingId(attachment.id)
    try {
      const blob = await downloadAttachment(constructionSiteId, attachment.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = attachment.fileName
      document.body.append(anchor)
      try { anchor.click() } finally {
        anchor.remove()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      if (currentSiteRef.current === constructionSiteId) {
        setFeedback({ type: 'error', message: errorMessage(error, 'record.attachments.downloadFailed') })
      }
    } finally {
      setDownloadingId(null)
    }
  }

  const requestRemove = (attachment: ConstructionSiteAttachment) => {
    if (!constructionSiteId || !canEdit) return
    modal.confirm({
      title: t('record.attachments.deleteTitle'),
      content: t('record.attachments.deleteMessage', { name: attachment.fileName }),
      okText: t('record.attachments.deleteAction'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (currentSiteRef.current !== constructionSiteId) return
        setDeletingId(attachment.id)
        try {
          await deleteAttachment(constructionSiteId, attachment.id)
          if (currentSiteRef.current !== constructionSiteId) return
          setAttachments((current) => current.filter((item) => item.id !== attachment.id))
          setFeedback({ type: 'success', message: t('record.attachments.deleted') })
        } catch (error) {
          if (currentSiteRef.current === constructionSiteId) {
            setFeedback({ type: 'error', message: errorMessage(error, 'record.attachments.deleteFailed') })
          }
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  return (
    <>
      {showHeading && <ConstructionSiteSectionTitle label={t('constructionSites.attachments.label')} />}
      <div className="attachment-content">
        {!constructionSiteId && <p className="details-hint">{t('constructionSites.attachments.saveFirst')}</p>}
        {constructionSiteId && <p className="details-hint record-document-hint">
          {t(canEdit ? 'record.attachments.immediate' : 'record.attachments.downloadHint')}
        </p>}
        {canEdit && constructionSiteId && <Upload showUploadList={false}
          disabled={uploading || loadingAttachments || loadFailed || deletingId !== null}
          beforeUpload={(file) => { void upload(file); return Upload.LIST_IGNORE }}>
          <Button className="record-document-upload" htmlType="button" icon={<UploadOutlined />}
            loading={uploading} disabled={loadingAttachments || loadFailed || deletingId !== null}>
            {t('constructionSites.attachments.add')}
          </Button>
        </Upload>}
        {feedback && <Alert className="record-document-feedback" type={feedback.type} title={feedback.message} showIcon />}
        {loadFailed && <Button htmlType="button" onClick={() => void loadAttachments()} disabled={loadingAttachments}>
          {t('record.attachments.retry')}
        </Button>}
        <Spin spinning={loadingAttachments}>
          {constructionSiteId && attachments.length === 0 && !loadingAttachments && !loadFailed && (
            <Empty className="attachment-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('constructionSites.attachments.empty')} />
          )}
          {attachments.length > 0 && (
            <div className="details-card-list attachment-card-list">
              {attachments.map((attachment) => (
                <div className="details-card-shell attachment-card-shell" key={attachment.id}>
                  <Card className="details-card attachment-card" size="small" role="button" tabIndex={0}
                    aria-label={attachment.fileName} aria-busy={downloadingId === attachment.id}
                    onClick={() => { if (!downloadingId) void download(attachment) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        if (!downloadingId) void download(attachment)
                      }
                    }}>
                    <PaperClipOutlined className="attachment-file-icon" />
                    <div className="attachment-card-content">
                      <strong title={attachment.fileName}>{attachment.fileName}</strong>
                      <span>{formatFileSize(attachment.fileSize, locale)}</span>
                    </div>
                    <Spin spinning={downloadingId === attachment.id} size="small"><DownloadOutlined className="attachment-download" /></Spin>
                  </Card>
                  {canEdit && <Button className="details-card-delete" danger shape="circle" icon={<DeleteOutlined />}
                    loading={deletingId === attachment.id} disabled={uploading || deletingId !== null}
                    aria-label={t('constructionSites.attachments.delete', { name: attachment.fileName })}
                    onClick={(event) => { event.stopPropagation(); requestRemove(attachment) }} />}
                </div>
              ))}
            </div>
          )}
        </Spin>
      </div>
    </>
  )
}
