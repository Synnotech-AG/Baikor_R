import { Button, Checkbox, InputNumber, Switch } from 'antd'
import { useTranslation } from 'react-i18next'
import type { ConstructionSiteStatus } from '../construction-sites/types'
import type { RouteConflictRule } from './types'

interface AlertRuleSettingsProps {
  rule: RouteConflictRule
  enabled: boolean
  saving: boolean
  onChange: (rule: RouteConflictRule) => void
  onSave: () => void
}

export function AlertRuleSettings({
  rule,
  enabled,
  saving,
  onChange,
  onSave,
}: AlertRuleSettingsProps) {
  const { t } = useTranslation()
  return (
    <section className="alert-rule-form">
      <label>
        <Switch
          checked={rule.enabled}
          disabled={!enabled || saving}
          onChange={(checked) => onChange({ ...rule, enabled: checked })}
        />{' '}
        {t('alerts.enabled')}
      </label>
      <label htmlFor="alert-rule-distance">{t('alerts.sensitivity')}</label>
      <InputNumber
        id="alert-rule-distance"
        min={0}
        max={1000}
        value={rule.sensitivityMetres}
        disabled={!enabled || saving}
        onChange={(value) => onChange({ ...rule, sensitivityMetres: value ?? 0 })}
      />
      <fieldset>
        <legend>{t('alerts.statuses')}</legend>
        <Checkbox.Group
          value={rule.eligibleStatuses}
          disabled={!enabled || saving}
          onChange={(values) =>
            onChange({ ...rule, eligibleStatuses: values as ConstructionSiteStatus[] })
          }
          options={(['draft', 'planned', 'approved', 'active'] as const).map((value) => ({
            value,
            label: t(`constructionSites.status.${value}`),
          }))}
        />
      </fieldset>
      <Button
        type="primary"
        disabled={!enabled || rule.eligibleStatuses.length === 0}
        loading={saving}
        onClick={onSave}
      >
        {t('common.save')}
      </Button>
    </section>
  )
}
