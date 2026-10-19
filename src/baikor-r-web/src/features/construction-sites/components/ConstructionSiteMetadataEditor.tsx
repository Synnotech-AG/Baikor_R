import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Tooltip } from 'antd'
import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { FormItem } from 'react-hook-form-antd'
import { useTranslation } from 'react-i18next'
import { InfoLabel } from '../../../shared/components/InfoLabel'
import type { ConstructionSiteFormValues } from '../types'

interface ConstructionSiteMetadataEditorProps {
  form: UseFormReturn<ConstructionSiteFormValues>
  canEdit: boolean
}

export function ConstructionSiteMetadataEditor({ form, canEdit }: ConstructionSiteMetadataEditorProps) {
  const { t } = useTranslation()
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'metadata',
    keyName: 'fieldKey',
  })
  const metadataError = form.formState.errors.metadata?.message

  return (
    <section className="details-section metadata-section">
      <div className="details-section-heading">
        <h3>
          <InfoLabel info={t('constructionSites.metadata.info')}>
            {t('constructionSites.metadata.label')}
          </InfoLabel>
        </h3>
        <Tooltip title={t('constructionSites.metadata.add')}>
          <Button
            className="section-icon-action"
            htmlType="button"
            size="small"
            shape="circle"
            icon={<PlusOutlined />}
            disabled={!canEdit || fields.length >= 100}
            aria-label={t('constructionSites.metadata.add')}
            onClick={() => append({ key: '', value: '' })}
          />
        </Tooltip>
      </div>

      {fields.length > 0 && <div className="metadata-list">
        {fields.map((field, index) => (
          <div className="metadata-row" key={field.fieldKey}>
            <FormItem control={form.control} name={`metadata.${index}.key`} disabled={!canEdit}>
              <Input
                maxLength={100}
                placeholder={t('constructionSites.metadata.keyPlaceholder')}
                aria-label={t('constructionSites.metadata.key')}
              />
            </FormItem>
            <FormItem control={form.control} name={`metadata.${index}.value`} disabled={!canEdit}>
              <Input
                maxLength={4000}
                placeholder={t('constructionSites.metadata.valuePlaceholder')}
                aria-label={t('constructionSites.metadata.value')}
              />
            </FormItem>
            <Tooltip title={t('constructionSites.metadata.delete')}>
              <Button
                className="metadata-delete-action"
                htmlType="button"
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={!canEdit}
                aria-label={t('constructionSites.metadata.delete')}
                onClick={() => remove(index)}
              />
            </Tooltip>
          </div>
        ))}
      </div>}

      {typeof metadataError === 'string' && <div className="metadata-list-error" role="alert">
        {metadataError}
      </div>}
    </section>
  )
}
