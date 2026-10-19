import { CloseOutlined, DeleteOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Tooltip } from 'antd'
import { useCallback } from 'react'
import { useWatch, type FieldErrors, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { ConstructionSiteFormValues, ConstructionSiteSummary, EditorArea } from '../types'
import { AttachmentsEditor } from './AttachmentsEditor'
import { ConstructionSiteAdditionalDataSection } from './ConstructionSiteAdditionalDataSection'
import { ConstructionSiteAreasSection } from './ConstructionSiteAreasSection'
import { ConstructionSiteGeneralSection } from './ConstructionSiteGeneralSection'
import { ConstructionSiteSectionTitle } from './ConstructionSiteSectionTitle'

type EditorSectionKey = 'general' | 'areas' | 'additional-data' | 'attachments'

function firstSectionWithErrors(errors: FieldErrors<ConstructionSiteFormValues>): EditorSectionKey | null {
  if (errors.title || errors.plannedStart || errors.plannedEnd || errors.status || errors.contacts) {
    return 'general'
  }
  if (errors.diversion || errors.communications || errors.metadata) return 'additional-data'
  return null
}

interface ConstructionSiteEditorProps {
  form: UseFormReturn<ConstructionSiteFormValues>
  selectedSite: ConstructionSiteSummary | null
  areas: EditorArea[]
  selectedAreaKey: string | null
  canEdit: boolean
  drawing: boolean
  geometryDirty: boolean
  feedback: { type: 'error' | 'info'; message: string } | null
  saving: boolean
  deleting: boolean
  onSubmit: (values: ConstructionSiteFormValues) => void
  onToggleDrawing: () => void
  onSelectArea: (key: string) => void
  onDeleteArea: (key: string) => void
  onDiscard: () => void
  onClose: () => void
  onDelete: () => void
}

export function ConstructionSiteEditor({
  form,
  selectedSite,
  areas,
  selectedAreaKey,
  canEdit,
  drawing,
  geometryDirty,
  feedback,
  saving,
  deleting,
  onSubmit,
  onToggleDrawing,
  onSelectArea,
  onDeleteArea,
  onDiscard,
  onClose,
  onDelete,
}: ConstructionSiteEditorProps) {
  const { t } = useTranslation()
  const { control, handleSubmit, formState: { errors, isDirty } } = form
  const currentTitle = useWatch({ control, name: 'title' }).trim()
  const hasChanges = isDirty || geometryDirty
  const generalHasErrors = Boolean(errors.title || errors.plannedStart || errors.plannedEnd || errors.status || errors.contacts)
  const additionalDataHasErrors = Boolean(errors.diversion || errors.communications || errors.metadata)

  const revealSectionAndError = useCallback((sectionKey: EditorSectionKey) => {
    window.setTimeout(() => {
      const section = document.querySelector<HTMLElement>(`[data-editor-section="${sectionKey}"]`)
      const error = section?.querySelector<HTMLElement>(
        '.ant-form-item-has-error input, .ant-form-item-has-error textarea, .ant-form-item-has-error .ant-select-selector, [role="alert"]',
      )
      error?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      error?.focus({ preventScroll: true })
    }, 0)
  }, [])

  const handleInvalid = useCallback((fieldErrors: FieldErrors<ConstructionSiteFormValues>) => {
    const sectionKey = firstSectionWithErrors(fieldErrors)
    if (sectionKey) revealSectionAndError(sectionKey)
  }, [revealSectionAndError])

  return (
    <Form
      className="editor-panel"
      layout="vertical"
      requiredMark={false}
      onFinish={handleSubmit(onSubmit, handleInvalid)}
    >
      <div className="section-heading">
        <div className="section-heading-title">
          {currentTitle && <span className="construction-site-title-label">{currentTitle}</span>}
          <strong>{selectedSite
            ? t('constructionSites.editor.editTitle')
            : t('constructionSites.editor.createTitle')}</strong>
        </div>
        <div className="section-heading-actions">
          {canEdit && <Tooltip title={t('constructionSites.delete.action')}>
            <Button
              danger
              type="text"
              htmlType="button"
              icon={<DeleteOutlined />}
              loading={deleting}
              disabled={saving}
              aria-label={t('constructionSites.delete.action')}
              onClick={onDelete}
            />
          </Tooltip>}
          <Tooltip title={t('constructionSites.close.action')}>
            <Button
              type="text"
              htmlType="button"
              icon={<CloseOutlined />}
              disabled={saving || deleting}
              aria-label={t('constructionSites.close.action')}
              onClick={onClose}
            />
          </Tooltip>
        </div>
      </div>

      <div className="editor-sections">
        <section className="editor-section" data-editor-section="general">
          <ConstructionSiteSectionTitle label={t('constructionSites.sections.general')} hasError={generalHasErrors} />
          <ConstructionSiteGeneralSection form={form} canEdit={canEdit} />
        </section>

        <section className="editor-section" data-editor-section="areas">
          <ConstructionSiteAreasSection areas={areas} selectedAreaKey={selectedAreaKey}
            canEdit={canEdit} drawing={drawing} onToggleDrawing={onToggleDrawing}
            onSelectArea={onSelectArea} onDeleteArea={onDeleteArea} />
        </section>

        <section className="editor-section" data-editor-section="additional-data">
          <ConstructionSiteSectionTitle label={t('constructionSites.sections.additionalData')} hasError={additionalDataHasErrors} />
          <ConstructionSiteAdditionalDataSection form={form} canEdit={canEdit} />
        </section>

        <section className="editor-section" data-editor-section="attachments">
          <AttachmentsEditor constructionSiteId={selectedSite?.id ?? null} canEdit={canEdit} />
        </section>
      </div>

      {feedback && <Alert className="save-message" type={feedback.type} title={feedback.message} showIcon />}

      {hasChanges && (
        <div className="editor-actions">
          <Button className="discard-action" htmlType="button" block disabled={saving || !canEdit} onClick={onDiscard}>
            {t('constructionSites.discard')}
          </Button>
          <Button className="save-action" htmlType="submit" block loading={saving} disabled={saving || !canEdit}>
            {t('constructionSites.save')}
          </Button>
        </div>
      )}
    </Form>
  )
}
