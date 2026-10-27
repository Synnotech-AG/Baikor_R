import { Form } from 'antd'
import { useCallback, useRef } from 'react'
import type { FieldErrors, UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { ConstructionSiteFormValues, ConstructionSiteSummary, EditorArea } from '../types'
import { AttachmentsEditor } from './AttachmentsEditor'
import { ConstructionSiteAdditionalDataSection } from './ConstructionSiteAdditionalDataSection'
import { ConstructionSiteAreasSection } from './ConstructionSiteAreasSection'
import { ConstructionSiteGeneralSection } from './ConstructionSiteGeneralSection'
import { ConstructionSiteFooter } from './ConstructionSiteFooter'
import { ConstructionSiteSectionTitle } from './ConstructionSiteSectionTitle'
import '../record-workspace.css'

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
  isNew: boolean
  drawing: boolean
  editingGeometry: boolean
  geometryDirty: boolean
  feedback: { type: 'error' | 'info'; message: string } | null
  saving: boolean
  deleting: boolean
  onSubmit: (values: ConstructionSiteFormValues) => void
  onToggleDrawing: () => void
  onSelectArea: (key: string) => void
  onDeleteArea: (key: string) => void
  onDiscard: () => void
  onDelete: () => Promise<void>
}

export function ConstructionSiteEditor({
  form,
  selectedSite,
  areas,
  selectedAreaKey,
  canEdit,
  isNew,
  drawing,
  editingGeometry,
  geometryDirty,
  feedback,
  saving,
  deleting,
  onSubmit,
  onToggleDrawing,
  onSelectArea,
  onDeleteArea,
  onDiscard,
  onDelete,
}: ConstructionSiteEditorProps) {
  const { t } = useTranslation()
  const { handleSubmit, formState: { errors, isDirty } } = form
  const sectionsRef = useRef<HTMLDivElement>(null)
  const hasChanges = isDirty || geometryDirty || drawing
  const generalHasErrors = Boolean(errors.title || errors.plannedStart || errors.plannedEnd || errors.status || errors.contacts)
  const additionalDataHasErrors = Boolean(errors.diversion || errors.communications || errors.metadata)

  const revealSectionAndError = useCallback((sectionKey: EditorSectionKey) => {
    window.setTimeout(() => {
      const section = sectionsRef.current?.querySelector<HTMLElement>(`[data-editor-section="${sectionKey}"]`)
      const error = section?.querySelector<HTMLElement>(
        '.ant-form-item-has-error input, .ant-form-item-has-error textarea, .ant-form-item-has-error .ant-select-selector, [role="alert"]',
      )
      error?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' })
      error?.focus({ preventScroll: true })
    }, 0)
  }, [])

  const handleInvalid = useCallback((fieldErrors: FieldErrors<ConstructionSiteFormValues>) => {
    const sectionKey = firstSectionWithErrors(fieldErrors)
    if (sectionKey) revealSectionAndError(sectionKey)
  }, [revealSectionAndError])

  return (
    <Form
      className="editor-panel record-workspace record-editor"
      layout="vertical"
      requiredMark={false}
      onFinish={handleSubmit(onSubmit, handleInvalid)}
    >
      <div ref={sectionsRef} className="editor-sections record-editor-content">
        <section className="editor-section" data-editor-section="general" tabIndex={-1} aria-label={t('constructionSites.sections.general')}>
          <ConstructionSiteSectionTitle label={t('constructionSites.sections.general')} hasError={generalHasErrors} />
          <ConstructionSiteGeneralSection form={form} canEdit={canEdit} />
        </section>

        <section className="editor-section" data-editor-section="areas" tabIndex={-1} aria-label={t('constructionSites.sections.areas')}>
          <ConstructionSiteAreasSection areas={areas} selectedAreaKey={selectedAreaKey}
            canEdit={canEdit} drawing={drawing} editingGeometry={editingGeometry}
            onToggleDrawing={onToggleDrawing}
            onSelectArea={onSelectArea} onDeleteArea={onDeleteArea} />
        </section>

        <section className="editor-section" data-editor-section="additional-data" tabIndex={-1} aria-label={t('constructionSites.sections.additionalData')}>
          <ConstructionSiteSectionTitle label={t('constructionSites.sections.additionalData')} hasError={additionalDataHasErrors} />
          <ConstructionSiteAdditionalDataSection form={form} canEdit={canEdit} />
        </section>

        <section className="editor-section" data-editor-section="attachments" tabIndex={-1} aria-label={t('constructionSites.attachments.label')}>
          <AttachmentsEditor constructionSiteId={isNew ? null : selectedSite?.id ?? null} canEdit={canEdit} />
        </section>
      </div>

      <ConstructionSiteFooter mode={isNew ? 'create' : 'edit'} selectedSite={selectedSite}
        canEdit={canEdit} hasChanges={hasChanges} drawing={drawing} saving={saving} deleting={deleting}
        feedback={feedback} onDiscard={onDiscard} onDelete={onDelete} />
    </Form>
  )
}
