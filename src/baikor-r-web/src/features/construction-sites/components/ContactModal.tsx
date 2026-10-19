import { DeleteOutlined } from '@ant-design/icons'
import { yupResolver } from '@hookform/resolvers/yup'
import { AutoComplete, Button, Form, Input, Modal } from 'antd'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { FormItem } from 'react-hook-form-antd'
import { useTranslation } from 'react-i18next'
import * as yup from 'yup'
import type { ConstructionSiteContactFormValues } from '../types'

interface ContactModalProps {
  open: boolean
  contact: ConstructionSiteContactFormValues | null
  onCancel: () => void
  onSave: (contact: ConstructionSiteContactFormValues) => void
  onDelete?: () => void
}

const emptyContact: ConstructionSiteContactFormValues = {
  id: null, firstName: '', lastName: '', role: '', email: '', phone1: '', phone2: '',
}

export function ContactModal({ open, contact, onCancel, onSave, onDelete }: ContactModalProps) {
  const { t } = useTranslation()
  const schema: yup.ObjectSchema<ConstructionSiteContactFormValues> = useMemo(() => yup.object({
    id: yup.string().nullable().defined(),
    firstName: yup.string().trim().required(t('validation.firstNameRequired')).max(100),
    lastName: yup.string().trim().required(t('validation.lastNameRequired')).max(100),
    role: yup.string().trim().required(t('validation.roleRequired')).max(100),
    email: yup.string().trim().email(t('validation.emailInvalid')).max(254).defined(),
    phone1: yup.string().trim().max(50).defined(),
    phone2: yup.string().trim().max(50).defined(),
  }), [t])
  const form = useForm<ConstructionSiteContactFormValues>({ resolver: yupResolver(schema), defaultValues: emptyContact })
  useEffect(() => { if (open) form.reset(contact ?? emptyContact) }, [contact, form, open])
  const roleOptions = ['Antragsteller', 'Genehmiger', 'Umsetzer', 'Ansprechperson vor Ort'].map((value) => ({ value }))

  return (
    <Modal open={open} title={contact ? t('constructionSites.contacts.edit') : t('constructionSites.contacts.create')}
      onCancel={onCancel} destroyOnHidden footer={[
        onDelete && <Button key="delete" className="modal-delete-action" danger icon={<DeleteOutlined />} onClick={onDelete}>{t('constructionSites.contacts.delete')}</Button>,
        <Button key="cancel" onClick={onCancel}>{t('common.cancel')}</Button>,
        <Button key="save" type="primary" onClick={() => void form.handleSubmit(onSave)()}>{t('common.save')}</Button>,
      ]}>
      <Form className="modal-form" layout="vertical" requiredMark={false}>
        <div className="contact-name-fields">
          <FormItem control={form.control} name="firstName" label={t('constructionSites.contacts.firstName')}><Input maxLength={100} /></FormItem>
          <FormItem control={form.control} name="lastName" label={t('constructionSites.contacts.lastName')}><Input maxLength={100} /></FormItem>
        </div>
        <FormItem control={form.control} name="role" label={t('constructionSites.contacts.role')}>
          <AutoComplete options={roleOptions} maxLength={100} placeholder={t('constructionSites.contacts.rolePlaceholder')} />
        </FormItem>
        <FormItem control={form.control} name="email" label={t('constructionSites.contacts.email')}><Input type="email" maxLength={254} /></FormItem>
        <div className="contact-phone-fields">
          <FormItem control={form.control} name="phone1" label={t('constructionSites.contacts.phone1')}><Input type="tel" maxLength={50} /></FormItem>
          <FormItem control={form.control} name="phone2" label={t('constructionSites.contacts.phone2')}><Input type="tel" maxLength={50} /></FormItem>
        </div>
      </Form>
    </Modal>
  )
}
