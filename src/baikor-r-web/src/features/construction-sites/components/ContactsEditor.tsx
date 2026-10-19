import { MailOutlined, PhoneOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Card, Tooltip } from 'antd'
import { useState } from 'react'
import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { InfoLabel } from '../../../shared/components/InfoLabel'
import type { ConstructionSiteContactFormValues, ConstructionSiteFormValues } from '../types'
import { ContactModal } from './ContactModal'

interface ContactsEditorProps {
  form: UseFormReturn<ConstructionSiteFormValues>
  canEdit: boolean
}

export function ContactsEditor({ form, canEdit }: ContactsEditorProps) {
  const { t } = useTranslation()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const { fields, append, update, remove } = useFieldArray({ control: form.control, name: 'contacts', keyName: 'fieldKey' })
  const selectedContact = editingIndex === null ? null : form.getValues(`contacts.${editingIndex}`)
  const closeModal = () => { setCreating(false); setEditingIndex(null) }
  const saveContact = (contact: ConstructionSiteContactFormValues) => {
    if (editingIndex === null) append(contact)
    else update(editingIndex, contact)
    closeModal()
  }

  return (
    <section className="details-section">
      <div className="details-section-heading">
        <h3><InfoLabel info={t('constructionSites.contacts.info')}>{t('constructionSites.contacts.label')}</InfoLabel></h3>
        <Tooltip title={t('constructionSites.contacts.add')}>
          <Button className="section-icon-action" htmlType="button" size="small" shape="circle"
            icon={<PlusOutlined />} disabled={!canEdit} aria-label={t('constructionSites.contacts.add')}
            onClick={() => setCreating(true)} />
        </Tooltip>
      </div>
      {fields.length > 0 && (
        <div className="details-card-list compact-card-list">
          {fields.map((contact, index) => (
            <Card className="details-card compact-details-card" key={contact.fieldKey} size="small" hoverable={canEdit}
              role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined}
              onClick={() => { if (canEdit) setEditingIndex(index) }}
              onKeyDown={(event) => { if (canEdit && event.key === 'Enter') setEditingIndex(index) }}>
              <UserOutlined className="compact-card-icon" />
              <div className="compact-card-content">
                <strong>{contact.firstName} {contact.lastName}</strong>
                <span>{contact.role}</span>
                {(contact.email || contact.phone1) && <small>
                  {contact.email && <><MailOutlined /> {contact.email}</>}
                  {contact.email && contact.phone1 && ' · '}
                  {contact.phone1 && <><PhoneOutlined /> {contact.phone1}</>}
                </small>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <ContactModal open={creating || editingIndex !== null} contact={selectedContact} onCancel={closeModal}
        onSave={saveContact}
        onDelete={editingIndex === null ? undefined : () => { remove(editingIndex); closeModal() }} />
    </section>
  )
}
