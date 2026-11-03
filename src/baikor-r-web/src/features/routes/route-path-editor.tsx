import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Button, Input, Tooltip, Upload } from 'antd'
import { useTranslation } from 'react-i18next'
import { LocalizedDatePicker } from '../../shared/localized-date-picker'
import type { RoutePathFormValues } from './types'

interface RoutePathEditorProps {
  path: RoutePathFormValues
  enabled: boolean
  canRemove: boolean
  onChange: (changes: Partial<RoutePathFormValues>) => void
  onRemove: () => void
  onDraw: () => void
  onUpload: (file: File) => void
}

export function RoutePathEditor({
  path,
  enabled,
  canRemove,
  onChange,
  onRemove,
  onDraw,
  onUpload,
}: RoutePathEditorProps) {
  const { t } = useTranslation()
  return (
    <div className="route-path-editor">
      <div className="route-path-name-field">
        <div>
          <label htmlFor={`route-path-title-${path.key}`}>{t('routes.pathName')}</label>
          <Input
            id={`route-path-title-${path.key}`}
            value={path.title}
            maxLength={200}
            disabled={!enabled}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>
        <Tooltip title={t('routes.removePath')}>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={t('routes.removePath')}
            disabled={!enabled || !canRemove}
            onClick={onRemove}
          />
        </Tooltip>
      </div>
      <div className="route-date-fields">
        <div>
          <label htmlFor={`route-from-${path.key}`}>{t('routes.from')}</label>
          <LocalizedDatePicker
            id={`route-from-${path.key}`}
            value={path.validFrom}
            disabled={!enabled}
            onChange={(validFrom) => onChange({ validFrom })}
          />
        </div>
        <div>
          <label htmlFor={`route-to-${path.key}`}>{t('routes.to')}</label>
          <LocalizedDatePicker
            id={`route-to-${path.key}`}
            value={path.validTo}
            disabled={!enabled}
            onChange={(validTo) => onChange({ validTo })}
          />
        </div>
      </div>
      <div className="route-geometry-actions">
        <Button icon={<EditOutlined />} disabled={!enabled} onClick={onDraw}>
          {t(path.geometry ? 'routes.redraw' : 'routes.draw')}
        </Button>
        <Upload
          accept=".json,.geojson,application/geo+json"
          showUploadList={false}
          disabled={!enabled}
          beforeUpload={(file) => {
            onUpload(file)
            return Upload.LIST_IGNORE
          }}
        >
          <Tooltip title={t('routes.vectorHint')}>
            <Button icon={<UploadOutlined />} disabled={!enabled}>
              {t('routes.vector')}
            </Button>
          </Tooltip>
        </Upload>
        {path.geometry && (
          <span className="route-geometry-state">
            <CheckCircleOutlined /> {t('routes.geometryPresent')}
          </span>
        )}
      </div>
    </div>
  )
}
