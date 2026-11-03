import { SearchOutlined } from '@ant-design/icons'
import { Checkbox, DatePicker, Input, Select } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { FilterPopover } from '../../../shared/filters/filter-popover'
import { FilterTags } from '../../../shared/filters/filter-tags'
import type { AppliedFilter } from '../../../shared/filters/filter-tags'
import { constructionSiteStatuses, statusTranslationKey } from '../constants'
import type { ConstructionSiteArchive, ConstructionSiteStatus } from '../types'
import './construction-site-filters.css'

interface SiteFilterValues {
  status: ConstructionSiteStatus | 'all'
  archive: ConstructionSiteArchive
  period: [Dayjs | null, Dayjs | null] | null
  includeUndated: boolean
}

interface ConstructionSiteFiltersProps {
  searchTerm: string
  status: ConstructionSiteStatus | 'all'
  period: [Dayjs | null, Dayjs | null] | null
  archive?: ConstructionSiteArchive
  includeUndated?: boolean
  onSearchChange: (value: string) => void
  onStatusChange: (value: ConstructionSiteStatus | 'all') => void
  onPeriodChange: (value: [Dayjs | null, Dayjs | null] | null) => void
  onArchiveChange?: (value: ConstructionSiteArchive) => void
  onIncludeUndatedChange?: (value: boolean) => void
}

export function ConstructionSiteFilters({
  searchTerm,
  status,
  period,
  archive = 'active',
  includeUndated = false,
  onSearchChange,
  onStatusChange,
  onPeriodChange,
  onArchiveChange,
  onIncludeUndatedChange,
}: ConstructionSiteFiltersProps) {
  const { t } = useTranslation()
  const value: SiteFilterValues = { status, archive, period, includeUndated }
  const hasPeriod = Boolean(period?.[0] || period?.[1])
  const tags: AppliedFilter[] = []
  if (status !== 'all') {
    tags.push({
      key: 'status',
      label: `${t('constructionSites.status.label')}: ${t(statusTranslationKey(status))}`,
      onRemove: () => onStatusChange('all'),
    })
  }
  if (archive !== 'all') {
    tags.push({
      key: 'archive',
      label: `${t('workspace.archive.label')}: ${t(`workspace.archive.${archive}`)}`,
      onRemove: () => onArchiveChange?.('all'),
    })
  }
  if (hasPeriod) {
    const from = period?.[0]?.format('DD.MM.YYYY')
    const to = period?.[1]?.format('DD.MM.YYYY')
    const label =
      from && to
        ? `${from} – ${to}`
        : from
          ? t('filters.from', { date: from })
          : t('filters.to', { date: to })
    tags.push({
      key: 'period',
      label: `${t('constructionSites.table.period')}: ${label}`,
      onRemove: () => {
        onPeriodChange(null)
        onIncludeUndatedChange?.(false)
      },
    })
    if (includeUndated) {
      tags.push({
        key: 'undated',
        label: t('workspace.includeUndated'),
        onRemove: () => onIncludeUndatedChange?.(false),
      })
    }
  }

  return (
    <div
      className="construction-site-filters"
      role="search"
      aria-label={t('constructionSites.table.filters')}
    >
      <div className="construction-site-filter-controls">
        <Input
          id="construction-site-search"
          aria-label={t('constructionSites.table.searchPlaceholder')}
          value={searchTerm}
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          placeholder={t('constructionSites.table.searchPlaceholder')}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <FilterPopover
          value={value}
          onApply={(draft) => {
            const nextPeriod = draft.period?.[0] || draft.period?.[1] ? draft.period : null
            onStatusChange(draft.status)
            onArchiveChange?.(draft.archive)
            onPeriodChange(nextPeriod)
            onIncludeUndatedChange?.(Boolean(nextPeriod && draft.includeUndated))
          }}
        >
          {(draft, update) => (
            <>
              <label htmlFor="construction-site-status">
                <span>{t('constructionSites.status.label')}</span>
                <Select
                  id="construction-site-status"
                  aria-label={t('constructionSites.status.label')}
                  value={draft.status}
                  onChange={(status) => update({ status })}
                  options={[
                    { value: 'all', label: t('constructionSites.table.allStatuses') },
                    ...constructionSiteStatuses.map((status) => ({
                      value: status,
                      label: t(statusTranslationKey(status)),
                    })),
                  ]}
                />
              </label>
              <label htmlFor="construction-site-archive">
                <span>{t('workspace.archive.label')}</span>
                <Select
                  id="construction-site-archive"
                  aria-label={t('workspace.archive.label')}
                  value={draft.archive}
                  onChange={(archive) => update({ archive })}
                  options={(['active', 'archived', 'all'] as const).map((archive) => ({
                    value: archive,
                    label: t(`workspace.archive.${archive}`),
                  }))}
                />
              </label>
              <div
                className="filter-popover-field"
                role="group"
                aria-labelledby="construction-site-period-label"
              >
                <span id="construction-site-period-label">
                  {t('constructionSites.table.period')}
                </span>
                <DatePicker.RangePicker
                  value={draft.period}
                  allowEmpty={[true, true]}
                  format="DD.MM.YYYY"
                  placeholder={[t('date.rangeStart'), t('date.rangeEnd')]}
                  onChange={(period) => update({ period: period as SiteFilterValues['period'] })}
                />
              </div>
              <Checkbox
                checked={draft.includeUndated}
                disabled={!draft.period?.[0] && !draft.period?.[1]}
                onChange={(event) => update({ includeUndated: event.target.checked })}
              >
                {t('workspace.includeUndated')}
              </Checkbox>
            </>
          )}
        </FilterPopover>
      </div>
      <FilterTags items={tags} />
    </div>
  )
}
