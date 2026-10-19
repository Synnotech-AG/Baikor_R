import { Input, Select } from 'antd'
import type { UseFormReturn } from 'react-hook-form'
import { FormItem } from 'react-hook-form-antd'
import { useTranslation } from 'react-i18next'
import { constructionSiteStatuses, statusTranslationKey } from '../constants'
import type { ConstructionSiteFormValues } from '../types'
import { ConstructionSiteDatePicker } from './ConstructionSiteDatePicker'
import { ContactsEditor } from './ContactsEditor'

interface ConstructionSiteGeneralSectionProps {
  form: UseFormReturn<ConstructionSiteFormValues>
  canEdit: boolean
}

export function ConstructionSiteGeneralSection({ form, canEdit }: ConstructionSiteGeneralSectionProps) {
  const { t } = useTranslation()
  const { control } = form

  return (
    <div className="form-preview">
      <FormItem control={control} name="title" label={t('constructionSites.title')} disabled={!canEdit}>
        <Input id="title" maxLength={200} placeholder={t('constructionSites.titlePlaceholder')} />
      </FormItem>

      <div className="date-fields">
        <FormItem className="date-field" control={control} name="plannedStart"
          label={t('constructionSites.start')} disabled={!canEdit}>
          <ConstructionSiteDatePicker id="planned-start" />
        </FormItem>
        <FormItem className="date-field" control={control} name="plannedEnd"
          label={t('constructionSites.end')} disabled={!canEdit}>
          <ConstructionSiteDatePicker id="planned-end" />
        </FormItem>
      </div>

      <FormItem className="status-field" label={t('constructionSites.status.label')}
        name="status" control={control} disabled={!canEdit}>
        <Select id="status" options={constructionSiteStatuses.map((status) => ({
          value: status,
          label: t(statusTranslationKey(status)),
        }))} />
      </FormItem>

      <ContactsEditor form={form} canEdit={canEdit} />
    </div>
  )
}
