import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Spin, Tooltip, Upload } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeleteConstructionSiteAttachmentEndpoint } from '../../../api/endpoints/useDeleteConstructionSiteAttachmentEndpoint'
import { useDownloadConstructionSiteAttachmentEndpoint } from '../../../api/endpoints/useDownloadConstructionSiteAttachmentEndpoint'
import { useGetConstructionSiteAttachmentsEndpoint } from '../../../api/endpoints/useGetConstructionSiteAttachmentsEndpoint'
import { useUploadConstructionSiteAttachmentEndpoint } from '../../../api/endpoints/useUploadConstructionSiteAttachmentEndpoint'
import type { ConstructionSiteAttachment } from '../types'
import { ConstructionSiteSectionTitle } from './ConstructionSiteSectionTitle'

interface AttachmentsEditorProps {
  constructionSiteId: string | null
  canEdit: boolean
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
}

export function AttachmentsEditor({ constructionSiteId, canEdit }: AttachmentsEditorProps) {
  const { t } = useTranslation()
  const [attachments, setAttachments] = useState<ConstructionSiteAttachment[]>([])
  const { execute: getAttachments, isLoading } = useGetConstructionSiteAttachmentsEndpoint()
  const { execute: uploadAttachment, isLoading: uploading } = useUploadConstructionSiteAttachmentEndpoint()
  const { execute: downloadAttachment } = useDownloadConstructionSiteAttachmentEndpoint()
  const { execute: deleteAttachment } = useDeleteConstructionSiteAttachmentEndpoint()

  const loadAttachments = useCallback(async () => {
    if (!constructionSiteId) {
      setAttachments([])
      return
    }
    try { setAttachments(await getAttachments(constructionSiteId)) } catch { setAttachments([]) }
  }, [constructionSiteId, getAttachments])

  useEffect(() => { void loadAttachments() }, [loadAttachments])

  const upload = async (file: File) => {
    if (!constructionSiteId) return
    await uploadAttachment(constructionSiteId, file)
    await loadAttachments()
  }

  const download = async (attachment: ConstructionSiteAttachment) => {
    if (!constructionSiteId) return
    const blob = await downloadAttachment(constructionSiteId, attachment.id)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = attachment.fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const remove = async (attachmentId: string) => {
    if (!constructionSiteId) return
    await deleteAttachment(constructionSiteId, attachmentId)
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))
  }

  return (
    <>
      <ConstructionSiteSectionTitle
        label={t('constructionSites.attachments.label')}
        action={(
          <Tooltip title={t('constructionSites.attachments.add')}>
            <Upload showUploadList={false} disabled={!canEdit || !constructionSiteId || uploading}
              beforeUpload={(file) => { void upload(file); return Upload.LIST_IGNORE }}>
              <Button className="section-icon-action" htmlType="button" size="small" shape="circle"
                icon={<UploadOutlined />} loading={uploading} disabled={!canEdit || !constructionSiteId}
                aria-label={t('constructionSites.attachments.add')} />
            </Upload>
          </Tooltip>
        )}
      />
      <div className="attachment-content">
        {!constructionSiteId && <p className="details-hint">{t('constructionSites.attachments.saveFirst')}</p>}
        <Spin spinning={isLoading}>
          {constructionSiteId && attachments.length === 0 && !isLoading && (
            <Empty className="attachment-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('constructionSites.attachments.empty')} />
          )}
          {attachments.length > 0 && (
            <div className="details-card-list attachment-card-list">
              {attachments.map((attachment) => (
                <div className="details-card-shell attachment-card-shell" key={attachment.id}>
                  <Card className="details-card attachment-card" size="small" role="button" tabIndex={0}
                    aria-label={attachment.fileName}
                    onClick={() => void download(attachment)} onKeyDown={(event) => { if (event.key === 'Enter') void download(attachment) }}>
                    <PaperClipOutlined className="attachment-file-icon" />
                    <div className="attachment-card-content">
                      <Tooltip title={attachment.fileName}><strong>{attachment.fileName}</strong></Tooltip>
                      <span>{formatFileSize(attachment.fileSize)}</span>
                    </div>
                    <DownloadOutlined className="attachment-download" />
                  </Card>
                  {canEdit && <Button className="details-card-delete" danger shape="circle" icon={<DeleteOutlined />} aria-label={t('constructionSites.attachments.delete', { name: attachment.fileName })} onClick={(event) => { event.stopPropagation(); void remove(attachment.id) }} />}
                </div>
              ))}
            </div>
          )}
        </Spin>
      </div>
    </>
  )
}
