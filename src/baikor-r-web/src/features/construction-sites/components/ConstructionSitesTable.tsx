import { DeleteOutlined, SettingOutlined } from '@ant-design/icons'
import { Button, Dropdown, Pagination, Space, Table, Tag } from 'antd'
import type { TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatArea, formatDate, formatDateTime } from '../../../shared/formatters'
import { statusTranslationKey } from '../constants'
import type { ConstructionSiteStatus, ConstructionSiteSummary } from '../types'
import './table-pagination.css'

const PAGE_SIZE = 10

interface ConstructionSitesTableProps {
  items: ConstructionSiteSummary[]
  totalCount?: number
  selectedId: string | null
  loading: boolean
  selectedIds: string[]
  canBulkDelete: boolean
  bulkDeleting: boolean
  onSelect: (site: ConstructionSiteSummary) => void
  onSelectionChange: (ids: string[]) => void
  onBulkDelete: () => void
}

export function ConstructionSitesTable({
  items,
  totalCount = items.length,
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
  const [optionalColumns, setOptionalColumns] = useState(['updatedAt'])
  const [page, setPage] = useState(1)
  const lastPage = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const currentPage = Math.min(page, lastPage)

  useEffect(() => {
    setPage((current) => Math.min(current, lastPage))
  }, [lastPage])

  const columns: TableProps<ConstructionSiteSummary>['columns'] = [
    {
      title: t('constructionSites.title'), dataIndex: 'title',
      ellipsis: true,
      className: 'table-site-title',
      sorter: (left, right) => left.title.localeCompare(right.title, locale),
      render: (title: string) => <strong title={title}>{title}</strong>,
    },
    {
      title: t('constructionSites.status.label'), dataIndex: 'status',
      width: 112,
      sorter: (left, right) => t(statusTranslationKey(left.status)).localeCompare(t(statusTranslationKey(right.status)), locale),
      render: (value: ConstructionSiteStatus) => <Tag className={`construction-site-status status-${value}`}>{t(statusTranslationKey(value))}</Tag>,
    },
    {
      title: t('constructionSites.table.period'), dataIndex: 'plannedStart',
      width: 192,
      className: 'table-site-period',
      sorter: (left, right) => (left.plannedStart ?? '').localeCompare(right.plannedStart ?? ''),
      render: (_: string | null, item) => item.plannedStart || item.plannedEnd
        ? <>{formatDate(item.plannedStart, locale)} – {formatDate(item.plannedEnd, locale)}</>
        : formatDate(null, locale),
    },
    {
      title: t('constructionSites.area'), dataIndex: 'areaSquareMetres',
      width: 96,
      align: 'right',
      className: 'table-site-area',
      sorter: (left, right) => left.areaSquareMetres - right.areaSquareMetres,
      render: (value: number) => formatArea(value, locale),
    },
    {
      title: t('constructionSites.table.updated'), dataIndex: 'updatedAt', defaultSortOrder: 'descend',
      width: 120,
      className: 'table-site-updated',
      sorter: (left, right) => left.updatedAt.localeCompare(right.updatedAt),
      render: (value: string) => formatDateTime(value, locale),
    },
  ]

  return (
    <section className="records-panel" aria-label={t('constructionSites.table.heading')}>
      <div className="table-options">
        <Dropdown trigger={['click']} menu={{
          selectable: true, multiple: true, selectedKeys: optionalColumns,
          items: [{ key: 'areaSquareMetres', label: t('constructionSites.area') }, { key: 'updatedAt', label: t('constructionSites.table.updated') }],
          onClick: ({ key }) => setOptionalColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]),
        }}>
          <Button type="text" size="small" icon={<SettingOutlined />}>{t('workspace.columns')}</Button>
        </Dropdown>
      </div>
      {selectedIds.length > 0 && canBulkDelete && (
        <div className="table-selection-toolbar">
          <span>{t('constructionSites.bulkDelete.selected', { count: selectedIds.length })}</span>
          <Space size="small" wrap>
            {selectedIds.length < items.length && (
              <Button type="text" size="small" onClick={() => onSelectionChange(items.map(item => item.id))}>
                {t('constructionSites.bulkDelete.selectAll', { count: items.length })}
              </Button>
            )}
            {selectedIds.length > 0 && (
              <Button type="text" size="small" onClick={() => onSelectionChange([])}>
                {t('constructionSites.bulkDelete.clearSelection')}
              </Button>
            )}
            <Button
              danger
              type="text"
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
      <Table
        className="construction-sites-table"
        rowKey="id"
        size="small"
        showSorterTooltip={false}
        loading={loading}
        columns={columns.filter((column) => !('dataIndex' in column) || !['areaSquareMetres', 'updatedAt'].includes(String(column.dataIndex)) || optionalColumns.includes(String(column.dataIndex)))}
        dataSource={items}
        tableLayout="fixed"
        scroll={{ x: 544 + (optionalColumns.includes('areaSquareMetres') ? 96 : 0) + (optionalColumns.includes('updatedAt') ? 120 : 0) }}
        rowSelection={canBulkDelete ? {
          columnWidth: 44,
          selectedRowKeys: selectedIds,
          preserveSelectedRowKeys: true,
          onChange: (keys) => onSelectionChange(keys.map(String)),
          getCheckboxProps: () => ({ disabled: bulkDeleting }),
          onCell: () => ({ onClick: (event) => event.stopPropagation() }),
        } : undefined}
        locale={{
          emptyText: loading
            ? null
            : t('constructionSites.table.noMatches'),
        }}
        pagination={{
          current: currentPage,
          pageSize: PAGE_SIZE,
          placement: ['none'],
          onChange: setPage,
        }}
        rowClassName={(item) => item.id === selectedId ? 'is-selected' : ''}
        onRow={(item) => ({
          tabIndex: 0,
          'data-site-id': item.id,
          'aria-selected': item.id === selectedId,
          onClick: () => onSelect(item),
          onKeyDown: (event) => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              onSelect(item)
            }
          },
        })}
      />
      <footer className="construction-sites-table-footer">
        <nav className="construction-sites-table-pages" aria-label={t('workspace.pagination')}>
          <Pagination
            current={currentPage}
            pageSize={PAGE_SIZE}
            total={items.length}
            onChange={setPage}
            showSizeChanger={false}
            showLessItems
            size="small"
            responsive
          />
        </nav>
        <span className="construction-sites-table-count" role="status">
          {totalCount > items.length
            ? t('workspace.results', { filtered: items.length, total: totalCount })
            : t('workspace.records', { count: items.length })}
        </span>
      </footer>
    </section>
  )
}
