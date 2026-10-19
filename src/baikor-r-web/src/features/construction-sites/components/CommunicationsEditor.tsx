import { MessageOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Tooltip } from 'antd'
import { useState } from 'react'
import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { ConstructionSiteCommunicationFormValues, ConstructionSiteFormValues } from '../types'
import { CommunicationModal } from './CommunicationModal'

interface CommunicationsEditorProps {
  form: UseFormReturn<ConstructionSiteFormValues>
  canEdit: boolean
}

export function CommunicationsEditor({ form, canEdit }: CommunicationsEditorProps) {
  const { t } = useTranslation()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const { fields, append, update, remove } = useFieldArray({ control: form.control, name: 'communications', keyName: 'fieldKey' })
  const selectedCommunication = editingIndex === null ? null : form.getValues(`communications.${editingIndex}`)
  const closeModal = () => { setCreating(false); setEditingIndex(null) }
  const saveCommunication = (communication: ConstructionSiteCommunicationFormValues) => {
    if (editingIndex === null) append(communication)
    else update(editingIndex, communication)
    closeModal()
  }

  return (
    <section className="details-section">
      <div className="details-section-heading">
        <h3>{t('constructionSites.communications.label')}</h3>
        <Tooltip title={t('constructionSites.communications.add')}>
          <Button className="section-icon-action" htmlType="button" size="small" shape="circle"
            icon={<PlusOutlined />} disabled={!canEdit} aria-label={t('constructionSites.communications.add')}
            onClick={() => setCreating(true)} />
        </Tooltip>
      </div>
      {fields.length > 0 && (
        <div className="details-card-list compact-card-list">
          {fields.map((communication, index) => (
            <Card className="details-card compact-details-card" key={communication.fieldKey} size="small" hoverable={canEdit}
              role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined}
              onClick={() => { if (canEdit) setEditingIndex(index) }}
              onKeyDown={(event) => { if (canEdit && event.key === 'Enter') setEditingIndex(index) }}>
              <MessageOutlined className="compact-card-icon" />
              <div className="compact-card-content">
                <strong>{communication.type}</strong>
                {communication.note && <span className="compact-card-note">{communication.note}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <CommunicationModal open={creating || editingIndex !== null} communication={selectedCommunication}
        onCancel={closeModal} onSave={saveCommunication}
        onDelete={editingIndex === null ? undefined : () => { remove(editingIndex); closeModal() }} />
    </section>
  )
}
