import { CheckOutlined, CloseOutlined, EditOutlined, FullscreenOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { AddressSearchResult } from '../map/AddressSearchResult'
import { AddressSearch } from './AddressSearch'
import './geometry-controls.css'

interface ConstructionSiteMapProps {
  mapElementRef: RefObject<HTMLDivElement | null>
  drawing: boolean
  editingGeometry: boolean
  canEditGeometry?: boolean
  canFinishDrawing?: boolean
  onSelectAddress: (result: AddressSearchResult) => void
  onCancelDrawing: () => void
  onFinishDrawing: () => void
  onStartEditing?: () => void
  onFitResults?: () => void
  onFinishEditing?: () => void
}

export function ConstructionSiteMap({
  mapElementRef,
  drawing,
  editingGeometry,
  canEditGeometry = false,
  canFinishDrawing = true,
  onSelectAddress,
  onCancelDrawing,
  onFinishDrawing,
  onStartEditing,
  onFitResults,
  onFinishEditing,
}: ConstructionSiteMapProps) {
  const { t } = useTranslation()
  return (
    <section className="map-panel" aria-label={t('constructionSites.map.label')}>
      <div className="map-toolbar map-context-toolbar">
        <div className="map-address-search" role="search" aria-label={t('geometry.addressSearch')}>
          <AddressSearch onSelect={onSelectAddress} />
          {canEditGeometry && !drawing && !editingGeometry && onStartEditing && <Tooltip title={t('geometry.edit')}>
            <Button className="map-edit-geometry" icon={<EditOutlined />} onClick={onStartEditing}
              aria-label={t('geometry.edit')} />
          </Tooltip>}
          {onFitResults && <Tooltip title={t('geometry.showResults')}>
            <Button className="map-fit-results" icon={<FullscreenOutlined />} onClick={onFitResults}
              aria-label={t('geometry.showResults')} />
          </Tooltip>}
        </div>
      </div>
      {(drawing || editingGeometry) && <div className="map-geometry-controls" aria-label={t('geometry.controls')}>
        <Tooltip title={t(drawing ? 'geometry.drawingHint' : 'geometry.editingHint')}>
          <span className="map-geometry-status">
            <EditOutlined />
            <span role="status">{t(drawing ? 'geometry.draw' : 'geometry.edit')}</span>
          </span>
        </Tooltip>
        <div className="map-geometry-actions">
          {drawing && <>
            <Tooltip title={t('geometry.finishDrawing')}>
              <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!canFinishDrawing}
                onClick={onFinishDrawing} aria-label={t('geometry.finishDrawing')} />
            </Tooltip>
            <Tooltip title={t('geometry.cancelDrawing')}>
              <Button size="small" type="text" icon={<CloseOutlined />}
                onClick={onCancelDrawing} aria-label={t('geometry.cancelDrawing')} />
            </Tooltip>
          </>}
          {!drawing && editingGeometry && onFinishEditing && <Tooltip title={t('geometry.finishEditing')}>
            <Button size="small" type="primary" icon={<CheckOutlined />}
              onClick={onFinishEditing} aria-label={t('geometry.finishEditing')} />
          </Tooltip>}
        </div>
      </div>}
      <div className="map-legend" aria-label={t('constructionSites.map.legend.label')}>
        <span><i className="map-legend-swatch saved" />{t('constructionSites.map.legend.saved')}</span>
        <span><i className="map-legend-swatch selected" />{t('constructionSites.map.legend.selected')}</span>
      </div>
      <div ref={mapElementRef} tabIndex={0} aria-label={t('constructionSites.map.label')}
        className={`map ${drawing ? 'is-drawing' : ''} ${editingGeometry ? 'is-editing-geometry' : ''}`} />
    </section>
  )
}
