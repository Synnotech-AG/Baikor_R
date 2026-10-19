import { CloseOutlined, FileAddOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { AddressSearchResult } from '../map/AddressSearchResult'
import { AddressSearch } from './AddressSearch'

interface ConstructionSiteMapProps {
  mapElementRef: RefObject<HTMLDivElement | null>
  drawing: boolean
  creating: boolean
  canCreate: boolean
  onSelectAddress: (result: AddressSearchResult) => void
  onCreate: () => void
  onCancelDrawing: () => void
}

export function ConstructionSiteMap({
  mapElementRef,
  drawing,
  creating,
  canCreate,
  onSelectAddress,
  onCreate,
  onCancelDrawing,
}: ConstructionSiteMapProps) {
  const { t } = useTranslation()
  return (
    <section className="map-panel" aria-label={t('constructionSites.map.label')}>
      <div className="map-toolbar">
        <Button className="new-site-action" type="primary" icon={<FileAddOutlined />} loading={creating}
          disabled={!canCreate} aria-label={t('constructionSites.new')} onClick={onCreate}>
          <span className="new-site-action-label">{t('constructionSites.new')}</span>
        </Button>
        <AddressSearch onSelect={onSelectAddress} />
      </div>
      {drawing && (
        <Tooltip title={t('constructionSites.cancelDrawing')}>
          <Button className="map-drawing-cancel" danger icon={<CloseOutlined />}
            aria-label={t('constructionSites.cancelDrawing')} onClick={onCancelDrawing}>
            {t('constructionSites.cancelDrawing')}
          </Button>
        </Tooltip>
      )}
      <div className="map-legend" aria-label={t('constructionSites.map.legend.label')}>
        <span><i className="map-legend-swatch saved" />{t('constructionSites.map.legend.saved')}</span>
        <span><i className="map-legend-swatch selected" />{t('constructionSites.map.legend.selected')}</span>
      </div>
      <div ref={mapElementRef} className={`map ${drawing ? 'is-drawing' : ''}`} />
    </section>
  )
}
