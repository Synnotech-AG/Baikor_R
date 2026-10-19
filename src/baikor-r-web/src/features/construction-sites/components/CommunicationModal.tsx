import { DeleteOutlined } from '@ant-design/icons'
import { yupResolver } from '@hookform/resolvers/yup'
import { AutoComplete, Button, Form, Input, Modal } from 'antd'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { FormItem } from 'react-hook-form-antd'
import { useTranslation } from 'react-i18next'
import * as yup from 'yup'
import { InfoLabel } from '../../../shared/components/InfoLabel'
import type { ConstructionSiteCommunicationFormValues } from '../types'

interface CommunicationModalProps {
  open: boolean
  communication: ConstructionSiteCommunicationFormValues | null
  onCancel: () => void
  onSave: (communication: ConstructionSiteCommunicationFormValues) => void
  onDelete?: () => void
}

const emptyCommunication: ConstructionSiteCommunicationFormValues = { id: null, type: '', note: '' }

export function CommunicationModal({ open, communication, onCancel, onSave, onDelete }: CommunicationModalProps) {
  const { t } = useTranslation()
  const schema: yup.ObjectSchema<ConstructionSiteCommunicationFormValues> = useMemo(() => yup.object({
    id: yup.string().nullable().defined(),
    type: yup.string().trim().required(t('validation.communicationTypeRequired')).max(2000),
    note: yup.string().trim().max(2000).defined(),
  }), [t])
  const form = useForm<ConstructionSiteCommunicationFormValues>({ resolver: yupResolver(schema), defaultValues: emptyCommunication })
  useEffect(() => { if (open) form.reset(communication ?? emptyCommunication) }, [communication, form, open])
  const typeOptions = [
    t('constructionSites.communications.type.residentInformation'),
    t('constructionSites.communications.type.pressRelease'),
    t('constructionSites.communications.type.signage'),
    t('constructionSites.communications.type.socialMedia'),
  ].map((value) => ({ value }))

  return (
    <Modal open={open} title={communication ? t('constructionSites.communications.edit') : t('constructionSites.communications.create')}
      onCancel={onCancel} destroyOnHidden footer={[
        onDelete && <Button key="delete" className="modal-delete-action" danger icon={<DeleteOutlined />} onClick={onDelete}>{t('constructionSites.communications.delete')}</Button>,
        <Button key="cancel" onClick={onCancel}>{t('common.cancel')}</Button>,
        <Button key="save" type="primary" onClick={() => void form.handleSubmit(onSave)()}>{t('common.save')}</Button>,
      ]}>
      <Form className="modal-form" layout="vertical" requiredMark={false}>
        <FormItem control={form.control} name="type"
          label={<InfoLabel info={t('constructionSites.communications.info')}>{t('constructionSites.communications.type')}</InfoLabel>}>
          <AutoComplete options={typeOptions} maxLength={2000} placeholder={t('constructionSites.communications.typePlaceholder')} />
        </FormItem>
        <FormItem control={form.control} name="note" label={t('constructionSites.communications.note')}>
          <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} maxLength={2000} />
        </FormItem>
      </Form>
    </Modal>
  )
}
