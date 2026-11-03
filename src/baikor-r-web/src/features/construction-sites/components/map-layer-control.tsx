import { AppstoreOutlined } from '@ant-design/icons'
import { Button, Checkbox, Popover } from 'antd'
import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  defaultMapLayerVisibility,
  mapLayerDefinitions,
  type MapLayerId,
  type MapLayerVisibility,
} from '../map/map-layer-model'
import './map-layer-control.css'

interface MapLayerOptionsProps {
  visibility: MapLayerVisibility
  disabledIds?: readonly MapLayerId[]
  onChange?: (id: MapLayerId, visible: boolean) => void
}

export function MapLayerOptions({ visibility, disabledIds = [], onChange }: MapLayerOptionsProps) {
  const { t } = useTranslation()
  return (
    <div className="map-layer-options" role="group" aria-label={t('map.layers.title')}>
      {mapLayerDefinitions.map((layer) => (
        <Checkbox
          key={layer.id}
          checked={visibility[layer.id]}
          disabled={disabledIds.includes(layer.id)}
          onChange={(event) => onChange?.(layer.id, event.target.checked)}
        >
          <span className="map-layer-option-label">
            <i className={`map-layer-swatch ${layer.kind}`} aria-hidden="true" />
            {t(layer.translationKey)}
          </span>
        </Checkbox>
      ))}
    </div>
  )
}

export function MapLayerControl({
  visibility = defaultMapLayerVisibility,
  disabledIds = [],
  onChange,
}: Partial<MapLayerOptionsProps>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dismissOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      title={t('map.layers.title')}
      content={
        <div onKeyDown={dismissOnEscape}>
          <MapLayerOptions visibility={visibility} disabledIds={disabledIds} onChange={onChange} />
        </div>
      }
    >
      <Button
        ref={triggerRef}
        className="map-layer-control"
        icon={<AppstoreOutlined />}
        aria-label={t('map.layers.title')}
        aria-expanded={open}
        onKeyDown={dismissOnEscape}
      />
    </Popover>
  )
}
