import { DatePicker, Input, Select } from 'antd'
import dayjs from 'dayjs'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterPopover } from '../../shared/filters/filter-popover'
import { FilterTags } from '../../shared/filters/filter-tags'
import { formatDate } from '../../shared/formatters'
import type { AlertFilters } from './types'
import './alert-filters.css'

export interface AlertFiltersComponentProps {
  filters: AlertFilters
  onChange: (patch: Partial<AlertFilters>) => void
  types?: readonly string[]
}

export function AlertFiltersComponent({
  filters,
  onChange,
  types = [],
}: AlertFiltersComponentProps) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const availableTypes = [...new Set(['routeConflict', ...types, filters.type])].filter(
    (type) => type !== 'all',
  )
  const typeLabel = (type: string) => (type === 'routeConflict' ? t('alerts.routeConflict') : type)
  const tags = []
  if (filters.type !== 'all') {
    tags.push({
      key: 'type',
      label: `${t('alerts.type')}: ${typeLabel(filters.type)}`,
      onRemove: () => onChange({ type: 'all' }),
    })
  }
  if (filters.condition !== 'all') {
    tags.push({
      key: 'condition',
      label: `${t('alerts.condition')}: ${t(`alerts.condition.${filters.condition}`)}`,
      onRemove: () => onChange({ condition: 'all' }),
    })
  }
  if (filters.handling !== 'all') {
    tags.push({
      key: 'handling',
      label: `${t('alerts.handling')}: ${t(`alerts.handling.${filters.handling}`)}`,
      onRemove: () => onChange({ handling: 'all' }),
    })
  }
  if (filters.period && filters.period !== 'all') {
    tags.push({
      key: 'period',
      label: `${t('alerts.period')}: ${t(`alerts.period.${filters.period}`)}`,
      onRemove: () => onChange({ period: 'all' }),
    })
  }
  if (filters.from || filters.to) {
    tags.push({
      key: 'dateRange',
      label: `${t('alerts.dateRange')}: ${filters.from ? formatDate(filters.from, locale) : t('filters.unbounded')} – ${filters.to ? formatDate(filters.to, locale) : t('filters.unbounded')}`,
      onRemove: () => onChange({ from: null, to: null }),
    })
  }

  return (
    <div className="alert-filters">
      <div className="alert-filter-actions">
        <Input.Search
          maxLength={200}
          value={filters.search}
          aria-label={t('alerts.search')}
          placeholder={t('alerts.search')}
          allowClear
          onChange={(event) => onChange({ search: event.target.value })}
        />
        <FilterPopover
          value={filters}
          onApply={(draft) =>
            onChange({
              type: draft.type,
              condition: draft.condition,
              handling: draft.handling,
              period: draft.period ?? 'all',
              from: draft.from ?? null,
              to: draft.to ?? null,
            })
          }
        >
          {(draft, update) => (
            <div className="alert-filter-fields">
              <label htmlFor={`${id}-type`}>{t('alerts.type')}</label>
              <Select
                id={`${id}-type`}
                className="alert-filter-type"
                aria-label={t('alerts.type')}
                value={draft.type}
                onChange={(type) => update({ type })}
                options={[
                  { value: 'all', label: t('alerts.allTypes') },
                  ...availableTypes.map((type) => ({ value: type, label: typeLabel(type) })),
                ]}
              />
              <label htmlFor={`${id}-condition`}>{t('alerts.condition')}</label>
              <Select
                id={`${id}-condition`}
                className="alert-filter-condition"
                aria-label={t('alerts.condition')}
                value={draft.condition}
                onChange={(condition) => update({ condition })}
                options={['all', 'present', 'cleared'].map((value) => ({
                  value,
                  label: t(value === 'all' ? 'alerts.all' : `alerts.condition.${value}`),
                }))}
              />
              <label htmlFor={`${id}-handling`}>{t('alerts.handling')}</label>
              <Select
                id={`${id}-handling`}
                className="alert-filter-handling"
                aria-label={t('alerts.handling')}
                value={draft.handling}
                onChange={(handling) => update({ handling })}
                options={['all', 'open', 'acknowledged', 'handled'].map((value) => ({
                  value,
                  label: t(value === 'all' ? 'alerts.all' : `alerts.handling.${value}`),
                }))}
              />
              <label htmlFor={`${id}-period`}>{t('alerts.period')}</label>
              <Select
                id={`${id}-period`}
                className="alert-filter-period"
                aria-label={t('alerts.period')}
                value={draft.period ?? 'all'}
                onChange={(period) => update({ period })}
                options={['all', 'current', 'upcoming', 'past'].map((value) => ({
                  value,
                  label: t(`alerts.period.${value}`),
                }))}
              />
              <div
                className="alert-filter-date-range"
                role="group"
                aria-label={t('alerts.dateRange')}
              >
                <span>{t('alerts.dateRange')}</span>
                <label className="alert-filter-date-label" htmlFor={`${id}-from`}>
                  {t('alerts.from')}
                </label>
                <label className="alert-filter-date-label" htmlFor={`${id}-to`}>
                  {t('alerts.to')}
                </label>
                <DatePicker.RangePicker
                  id={{ start: `${id}-from`, end: `${id}-to` }}
                  value={[draft.from ? dayjs(draft.from) : null, draft.to ? dayjs(draft.to) : null]}
                  allowEmpty={[true, true]}
                  allowClear
                  format={locale === 'en-GB' ? 'DD/MM/YYYY' : 'DD.MM.YYYY'}
                  placeholder={[t('alerts.from'), t('alerts.to')]}
                  onChange={(dates) =>
                    update({
                      from: dates?.[0]?.format('YYYY-MM-DD') ?? null,
                      to: dates?.[1]?.format('YYYY-MM-DD') ?? null,
                    })
                  }
                  getPopupContainer={(trigger) => trigger.closest('.app-shell') ?? document.body}
                />
              </div>
            </div>
          )}
        </FilterPopover>
      </div>
      <FilterTags items={tags} />
    </div>
  )
}
