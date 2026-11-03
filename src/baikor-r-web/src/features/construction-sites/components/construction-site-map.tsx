import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import type { ReactNode, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { AddressSearchResult } from '../map/address-search-result'
import {
  defaultMapLayerVisibility,
  mapLayerDefinitions,
  type MapLayerId,
  type MapLayerVisibility,
} from '../map/map-layer-model'
import { AddressSearch } from './address-search'
import { MapLayerControl } from './map-layer-control'
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
  onFinishEditing?: () => void
  routeDrawing?: boolean
  canFinishRouteDrawing?: boolean
  onFinishRouteDrawing?: () => void
  onCancelRouteDrawing?: () => void
  layerVisibility?: MapLayerVisibility
  onLayerVisibilityChange?: (id: MapLayerId, visible: boolean) => void
  alertTimeline?: ReactNode
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
  onFinishEditing,
  routeDrawing = false,
  canFinishRouteDrawing = false,
  onFinishRouteDrawing,
  onCancelRouteDrawing,
  layerVisibility = defaultMapLayerVisibility,
  onLayerVisibilityChange,
  alertTimeline,
}: ConstructionSiteMapProps) {
  const { t } = useTranslation()
  return (
    <section className="map-panel" aria-label={t('constructionSites.map.label')}>
      <div className="map-toolbar map-context-toolbar">
        <div className="map-address-search" role="search" aria-label={t('geometry.addressSearch')}>
          <AddressSearch onSelect={onSelectAddress} />
          {canEditGeometry && !drawing && !routeDrawing && !editingGeometry && onStartEditing && (
            <Tooltip title={t('geometry.edit')}>
              <Button
                className="map-edit-geometry"
                icon={<EditOutlined />}
                onClick={onStartEditing}
                aria-label={t('geometry.edit')}
              />
            </Tooltip>
          )}
          <MapLayerControl
            visibility={layerVisibility}
            onChange={onLayerVisibilityChange}
            disabledIds={[
              ...(drawing || editingGeometry ? (['constructionSites'] as const) : []),
              ...(routeDrawing ? (['routes'] as const) : []),
            ]}
          />
        </div>
      </div>
      {(drawing || routeDrawing || editingGeometry) && (
        <div className="map-geometry-controls" aria-label={t('geometry.controls')}>
          <Tooltip
            title={t(
              routeDrawing
                ? 'routes.drawHint'
                : drawing
                  ? 'geometry.drawingHint'
                  : 'geometry.editingHint',
            )}
          >
            <span className="map-geometry-status">
              <EditOutlined />
              <span role="status">
                {t(routeDrawing ? 'routes.draw' : drawing ? 'geometry.draw' : 'geometry.edit')}
              </span>
            </span>
          </Tooltip>
          <div className="map-geometry-actions">
            {(drawing || routeDrawing) && (
              <>
                <Tooltip
                  title={t(routeDrawing ? 'routes.finishDrawing' : 'geometry.finishDrawing')}
                >
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckOutlined />}
                    disabled={routeDrawing ? !canFinishRouteDrawing : !canFinishDrawing}
                    onClick={routeDrawing ? onFinishRouteDrawing : onFinishDrawing}
                    aria-label={t(routeDrawing ? 'routes.finishDrawing' : 'geometry.finishDrawing')}
                  />
                </Tooltip>
                <Tooltip
                  title={t(routeDrawing ? 'routes.cancelDrawing' : 'geometry.cancelDrawing')}
                >
                  <Button
                    size="small"
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={routeDrawing ? onCancelRouteDrawing : onCancelDrawing}
                    aria-label={t(routeDrawing ? 'routes.cancelDrawing' : 'geometry.cancelDrawing')}
                  />
                </Tooltip>
              </>
            )}
            {!drawing && !routeDrawing && editingGeometry && onFinishEditing && (
              <Tooltip title={t('geometry.finishEditing')}>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={onFinishEditing}
                  aria-label={t('geometry.finishEditing')}
                />
              </Tooltip>
            )}
          </div>
        </div>
      )}
      {layerVisibility.alerts && alertTimeline}
      {mapLayerDefinitions.some((layer) => layerVisibility[layer.id]) && (
        <div className="map-legend" aria-label={t('constructionSites.map.legend.label')}>
          {mapLayerDefinitions
            .filter((layer) => layerVisibility[layer.id])
            .map((layer) => (
              <span key={layer.id}>
                <i
                  className={`map-legend-swatch ${layer.kind === 'area' ? 'saved' : layer.kind === 'line' ? 'route' : 'warning'}`}
                />
                {t(layer.translationKey)}
              </span>
            ))}
          {(layerVisibility.constructionSites || layerVisibility.routes) && (
            <span>
              {layerVisibility.constructionSites && <i className="map-legend-swatch selected" />}
              {layerVisibility.routes && <i className="map-legend-swatch selected-route" />}
              {t('constructionSites.map.legend.selected')}
            </span>
          )}
        </div>
      )}
      <div
        ref={mapElementRef}
        tabIndex={0}
        aria-label={t('constructionSites.map.label')}
        className={`map ${drawing || routeDrawing ? 'is-drawing' : ''} ${editingGeometry ? 'is-editing-geometry' : ''}`}
      />
    </section>
  )
}
