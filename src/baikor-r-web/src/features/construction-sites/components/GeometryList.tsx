import { DeleteOutlined, GatewayOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { formatArea } from '../../../shared/formatters'
import type { EditorArea } from '../types'
import './geometry-controls.css'

interface GeometryListProps {
  areas: EditorArea[]
  canEdit: boolean
  canDelete?: boolean
  selectedAreaKey: string | null
  onSelect: (key: string) => void
  onDelete?: (key: string) => void
  onAdd?: () => void
}

export function GeometryList({ areas, canEdit, canDelete = canEdit, selectedAreaKey, onSelect, onDelete, onAdd }: GeometryListProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('de') ? 'de-DE' : 'en-US'

  if (areas.length === 0 && !(canEdit && onAdd)) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('geometry.empty')} />
  }

  return (
    <div className="details-card-list area-card-list" aria-label={t('constructionSites.areaList')}>
      {areas.map((area) => (
        <article className="details-card-shell area-card-shell" key={area.key}>
          <Card
            size="small"
            className={`details-card area-card ${area.key === selectedAreaKey ? 'is-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={area.key === selectedAreaKey}
            onClick={() => onSelect(area.key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(area.key)
              }
            }}
          >
            <GatewayOutlined className="area-card-icon" />
            <div className="area-card-content">
              <Tooltip title={area.name}><strong>{area.name}</strong></Tooltip>
              <span>{formatArea(area.areaSquareMetres, locale)}</span>
            </div>
          </Card>
          {canEdit && canDelete && onDelete && <Tooltip title={t('constructionSites.deleteArea', { name: area.name })}>
            <Button
              className="details-card-delete"
              shape="circle"
              danger
              aria-label={t('constructionSites.deleteArea', { name: area.name })}
              icon={<DeleteOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                onDelete(area.key)
              }}
            />
          </Tooltip>}
        </article>
      ))}
      {canEdit && onAdd && <Button className="area-card area-card-add" type="dashed" htmlType="button"
        icon={<PlusOutlined aria-hidden />} onClick={onAdd}>
        {t('geometry.add')}
      </Button>}
    </div>
  )
}
