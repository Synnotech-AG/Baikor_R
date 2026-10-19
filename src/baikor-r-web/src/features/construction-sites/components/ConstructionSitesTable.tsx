import { DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { Button, Space, Table, Tag } from 'antd'
import type { TableProps } from 'antd'
import type { Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatArea, formatDate, formatDateTime } from '../../../shared/formatters'
import { statusTranslationKey } from '../constants'
import type { ConstructionSiteStatus, ConstructionSiteSummary } from '../types'
import { ConstructionSiteFilters } from './ConstructionSiteFilters'

interface ConstructionSitesTableProps {
  items: ConstructionSiteSummary[]
  selectedId: string | null
  loading: boolean
  selectedIds: string[]
  canBulkDelete: boolean
  bulkDeleting: boolean
  onSelect: (site: ConstructionSiteSummary) => void
  onSelectionChange: (ids: string[]) => void
  onBulkDelete: () => void
}

const statusColors: Record<ConstructionSiteStatus, string> = {
  draft: 'default', planned: 'blue', approved: 'green', active: 'volcano',
}

export function ConstructionSitesTable({
  items,
  selectedId,
  loading,
  selectedIds,
  canBulkDelete,
  bulkDeleting,
  onSelect,
  onSelectionChange,
  onBulkDelete,
}: ConstructionSitesTableProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('de') ? 'de-DE' : 'en-US'
  const [searchTerm, setSearchTerm] = useState('')
  const [status, setStatus] = useState<ConstructionSiteStatus | 'all'>('all')
  const [period, setPeriod] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [pageSize, setPageSize] = useState(() => {
    const stored = Number(window.localStorage.getItem('constructionSites.pageSize'))
    return [5, 10, 20, 50].includes(stored) ? stored : 10
  })

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase(locale)
    const periodStart = period?.[0]?.format('YYYY-MM-DD')
    const periodEnd = period?.[1]?.format('YYYY-MM-DD')
    return items.filter((item) => {
      const searchableText = [
        item.title,
        ...Object.entries(item.metadata ?? {}).flatMap(([key, value]) => [key, value]),
      ].join(' ').toLocaleLowerCase(locale)
      if (normalizedSearch && !searchableText.includes(normalizedSearch)) return false
      if (status !== 'all' && item.status !== status) return false
      if (periodStart && (!item.plannedEnd || item.plannedEnd < periodStart)) return false
      if (periodEnd && (!item.plannedStart || item.plannedStart > periodEnd)) return false
      return true
    })
  }, [items, locale, period, searchTerm, status])

  const selectedSiteIsFilteredOut = Boolean(
    selectedId && items.some((item) => item.id === selectedId)
      && !filteredItems.some((item) => item.id === selectedId),
  )

  const resetFilters = () => {
    setSearchTerm('')
    setStatus('all')
    setPeriod(null)
  }

  const columns: TableProps<ConstructionSiteSummary>['columns'] = [
    {
      title: t('constructionSites.title'), dataIndex: 'title',
      width: 240,
      sorter: (left, right) => left.title.localeCompare(right.title, locale),
      render: (title: string) => <strong title={title}>{title}</strong>,
    },
    {
      title: t('constructionSites.status.label'), dataIndex: 'status',
      width: 110,
      sorter: (left, right) => t(statusTranslationKey(left.status)).localeCompare(t(statusTranslationKey(right.status)), locale),
      render: (value: ConstructionSiteStatus) => <Tag color={statusColors[value]}>{t(statusTranslationKey(value))}</Tag>,
    },
    {
      title: t('constructionSites.table.period'), dataIndex: 'plannedStart',
      width: 200,
      sorter: (left, right) => (left.plannedStart ?? '').localeCompare(right.plannedStart ?? ''),
      render: (_: string | null, item) => <>{formatDate(item.plannedStart, locale)} – {formatDate(item.plannedEnd, locale)}</>,
    },
    {
      title: t('constructionSites.area'), dataIndex: 'areaSquareMetres',
      width: 105,
      sorter: (left, right) => left.areaSquareMetres - right.areaSquareMetres,
      render: (value: number) => formatArea(value, locale),
    },
    {
      title: t('constructionSites.table.updated'), dataIndex: 'updatedAt', defaultSortOrder: 'descend',
      width: 130,
      responsive: ['md'],
      sorter: (left, right) => left.updatedAt.localeCompare(right.updatedAt),
      render: (value: string) => formatDateTime(value, locale),
    },
  ]

  return (
    <section className="records-panel" aria-label={t('constructionSites.table.heading')}>
      <ConstructionSiteFilters
        searchTerm={searchTerm}
        status={status}
        period={period}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatus}
        onPeriodChange={setPeriod}
      />
      {(selectedIds.length > 0 || filteredItems.length > 0) && canBulkDelete && (
        <div className="table-selection-toolbar">
          <span>{t('constructionSites.bulkDelete.selected', { count: selectedIds.length })}</span>
          <Space size="small" wrap>
            {selectedIds.length < filteredItems.length && (
              <Button size="small" onClick={() => onSelectionChange(filteredItems.map(item => item.id))}>
                {t('constructionSites.bulkDelete.selectAll', { count: filteredItems.length })}
              </Button>
            )}
            {selectedIds.length > 0 && (
              <Button size="small" onClick={() => onSelectionChange([])}>
                {t('constructionSites.bulkDelete.clearSelection')}
              </Button>
            )}
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={selectedIds.length === 0}
              loading={bulkDeleting}
              onClick={onBulkDelete}
            >
              {t('constructionSites.bulkDelete.action')}
            </Button>
          </Space>
        </div>
      )}
      {selectedSiteIsFilteredOut && (
        <div className="filtered-selection-notice" role="status">
          <InfoCircleOutlined aria-hidden />
          <span>{t('constructionSites.table.selectionFilteredOut')}</span>
          <Button type="link" size="small" onClick={resetFilters}>{t('constructionSites.table.resetFilters')}</Button>
        </div>
      )}
      <Table
        className="construction-sites-table"
        rowKey="id"
        size="small"
        showSorterTooltip={false}
        loading={loading}
        columns={columns}
        dataSource={filteredItems}
        tableLayout="fixed"
        rowSelection={canBulkDelete ? {
          selectedRowKeys: selectedIds,
          preserveSelectedRowKeys: true,
          onChange: (keys) => onSelectionChange(keys.map(String)),
          getCheckboxProps: () => ({ disabled: bulkDeleting }),
          onCell: () => ({ onClick: (event) => event.stopPropagation() }),
        } : undefined}
        locale={{
          emptyText: loading
            ? null
            : items.length === 0
              ? t('constructionSites.table.empty')
              : t('constructionSites.table.noMatches'),
        }}
        pagination={{
          pageSize,
          pageSizeOptions: [5, 10, 20, 50],
          showSizeChanger: { 'aria-label': t('constructionSites.table.pageSize') },
          onShowSizeChange: (_, size) => {
            setPageSize(size)
            window.localStorage.setItem('constructionSites.pageSize', String(size))
          },
          showTotal: () => t('constructionSites.table.total', { filtered: filteredItems.length, total: items.length }),
        }}
        rowClassName={(item) => item.id === selectedId ? 'is-selected' : ''}
        onRow={(item) => ({
          tabIndex: 0,
          'aria-selected': item.id === selectedId,
          onClick: () => onSelect(item),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(item)
            }
          },
        })}
      />
    </section>
  )
}
