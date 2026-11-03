import { CloseOutlined } from '@ant-design/icons'
import { Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import './filters.css'

export interface AppliedFilter {
  key: string
  label: string
  onRemove: () => void
}

export function FilterTags({ items }: { items: AppliedFilter[] }) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return null
  }
  return (
    <div className="filter-tags" aria-label={t('filters.active')}>
      {items.map((item) => (
        <Tag className="filter-tag" key={item.key}>
          <span className="filter-tag-label" title={item.label}>
            {item.label}
          </span>
          <button
            type="button"
            className="filter-tag-remove"
            aria-label={t('filters.remove', { filter: item.label })}
            onClick={item.onRemove}
          >
            <CloseOutlined aria-hidden />
          </button>
        </Tag>
      ))}
    </div>
  )
}
