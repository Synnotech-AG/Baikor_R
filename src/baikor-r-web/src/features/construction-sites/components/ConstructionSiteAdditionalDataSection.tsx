import { Input } from 'antd'
import type { UseFormReturn } from 'react-hook-form'
import { FormItem } from 'react-hook-form-antd'
import { useTranslation } from 'react-i18next'
import { InfoLabel } from '../../../shared/components/InfoLabel'
import type { ConstructionSiteFormValues } from '../types'
import { CommunicationsEditor } from './CommunicationsEditor'
import { ConstructionSiteMetadataEditor } from './ConstructionSiteMetadataEditor'

interface ConstructionSiteAdditionalDataSectionProps {
  form: UseFormReturn<ConstructionSiteFormValues>
  canEdit: boolean
}

export function ConstructionSiteAdditionalDataSection({
  form,
  canEdit,
}: ConstructionSiteAdditionalDataSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="form-preview additional-fields">
      <FormItem control={form.control} name="diversion"
        label={<InfoLabel info={t('constructionSites.diversion.info')}>{t('constructionSites.diversion.label')}</InfoLabel>}
        disabled={!canEdit}>
        <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={10000} />
      </FormItem>

      <CommunicationsEditor form={form} canEdit={canEdit} />

      <ConstructionSiteMetadataEditor form={form} canEdit={canEdit} />
    </div>
  )
}
