import { CheckOutlined, NodeIndexOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RoutePathEditor } from './route-path-editor'
import type { RouteFormValues, RoutePathFormValues } from './types'

interface RouteFormProps {
  form: RouteFormValues
  enabled: boolean
  selectedPathKey: string | null
  onChange: (changes: Partial<RouteFormValues>) => void
  onSelectPath: (key: string) => void
  onAddPath: () => void
  onRemovePath: (key: string) => void
  onDraw: (key: string) => void
  onUpload: (key: string, file: File) => void
}

export function RouteForm({
  form,
  enabled,
  selectedPathKey,
  onChange,
  onSelectPath,
  onAddPath,
  onRemovePath,
  onDraw,
  onUpload,
}: RouteFormProps) {
  const { t } = useTranslation()
  const [descriptionOpen, setDescriptionOpen] = useState(Boolean(form.description))
  const selectedPath = form.paths.find((path) => path.key === selectedPathKey) ?? form.paths[0]
  const updatePath = (key: string, changes: Partial<RoutePathFormValues>) => {
    onChange({
      paths: form.paths.map((path) => (path.key === key ? { ...path, ...changes } : path)),
    })
  }
  return (
    <div className="route-form-fields">
      <div className="route-form-section">
        <label htmlFor="route-title">{t('routes.name')}</label>
        <Input
          id="route-title"
          value={form.title}
          maxLength={200}
          onChange={(event) => onChange({ title: event.target.value })}
          disabled={!enabled}
        />
        <details
          className="route-optional-description"
          open={descriptionOpen}
          onToggle={(event) => setDescriptionOpen(event.currentTarget.open)}
        >
          <summary>{t('routes.description')}</summary>
          <Input.TextArea
            id="route-description"
            aria-label={t('routes.description')}
            value={form.description}
            maxLength={10000}
            onChange={(event) => onChange({ description: event.target.value })}
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={!enabled}
          />
        </details>
      </div>
      <section className="route-form-section" aria-labelledby="route-paths-heading">
        <h4 id="route-paths-heading">{t('routes.paths')}</h4>
        <div className="route-path-picker" role="group" aria-label={t('routes.paths')}>
          {form.paths.map((path, index) => (
            <Button
              className="route-path-choice"
              key={path.key}
              aria-pressed={path.key === selectedPath?.key}
              disabled={!enabled}
              onClick={() => onSelectPath(path.key)}
              icon={path.geometry ? <CheckOutlined /> : <NodeIndexOutlined />}
            >
              {path.title || t('routes.pathNumber', { number: index + 1 })}
            </Button>
          ))}
          <Button
            className="route-add-path"
            type="dashed"
            icon={<PlusOutlined />}
            disabled={!enabled}
            onClick={onAddPath}
          >
            {t('routes.addPath')}
          </Button>
        </div>
        {selectedPath && (
          <RoutePathEditor
            key={selectedPath.key}
            path={selectedPath}
            enabled={enabled}
            canRemove={form.paths.length > 1}
            onChange={(changes) => updatePath(selectedPath.key, changes)}
            onRemove={() => onRemovePath(selectedPath.key)}
            onDraw={() => onDraw(selectedPath.key)}
            onUpload={(file) => onUpload(selectedPath.key, file)}
          />
        )}
      </section>
    </div>
  )
}
