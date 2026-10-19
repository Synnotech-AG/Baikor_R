import { SearchOutlined } from '@ant-design/icons'
import { DatePicker, Input, Select } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { constructionSiteStatuses, statusTranslationKey } from '../constants'
import type { ConstructionSiteStatus } from '../types'

interface ConstructionSiteFiltersProps {
  searchTerm: string
  status: ConstructionSiteStatus | 'all'
  period: [Dayjs | null, Dayjs | null] | null
  onSearchChange: (value: string) => void
  onStatusChange: (value: ConstructionSiteStatus | 'all') => void
  onPeriodChange: (value: [Dayjs | null, Dayjs | null] | null) => void
}

export function ConstructionSiteFilters({
  searchTerm,
  status,
  period,
  onSearchChange,
  onStatusChange,
  onPeriodChange,
}: ConstructionSiteFiltersProps) {
  const { t } = useTranslation()
  return (
    <div className="records-filters" role="search" aria-label={t('constructionSites.table.filters')}>
      <label className="filter-field filter-search" htmlFor="construction-site-search">
        <span>{t('constructionSites.table.search')}</span>
        <Input
          id="construction-site-search"
          size="large"
          aria-label={t('constructionSites.table.searchPlaceholder')}
          value={searchTerm}
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          placeholder={t('constructionSites.table.searchPlaceholder')}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <label className="filter-field filter-status" htmlFor="construction-site-status">
        <span>{t('constructionSites.status.label')}</span>
        <Select
          id="construction-site-status"
          size="large"
          aria-label={t('constructionSites.status.label')}
          value={status}
          onChange={onStatusChange}
          options={[
            { value: 'all', label: t('constructionSites.table.allStatuses') },
            ...constructionSiteStatuses.map((candidate) => ({
              value: candidate,
              label: t(statusTranslationKey(candidate)),
            })),
          ]}
        />
      </label>
      <div className="filter-field filter-period" role="group" aria-labelledby="construction-site-period-label">
        <span id="construction-site-period-label">{t('constructionSites.table.period')}</span>
        <DatePicker.RangePicker
          size="large"
          value={period}
          format="DD.MM.YYYY"
          placeholder={[t('date.rangeStart'), t('date.rangeEnd')]}
          onChange={(dates) => onPeriodChange(dates as [Dayjs | null, Dayjs | null] | null)}
          getPopupContainer={(trigger) => trigger.closest('.app-shell') ?? document.body}
        />
      </div>
    </div>
  )
}
