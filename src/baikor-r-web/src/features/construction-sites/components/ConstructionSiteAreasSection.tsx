import { CloseOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useTranslation } from 'react-i18next'
import type { EditorArea } from '../types'
import { ConstructionSiteSectionTitle } from './ConstructionSiteSectionTitle'
import { GeometryList } from './GeometryList'
import './geometry-controls.css'

interface ConstructionSiteAreasSectionProps {
  areas: EditorArea[]
  selectedAreaKey: string | null
  canEdit: boolean
  drawing: boolean
  editingGeometry?: boolean
  onToggleDrawing: () => void
  onSelectArea: (key: string) => void
  onDeleteArea: (key: string) => void
}

export function ConstructionSiteAreasSection({
  areas,
  selectedAreaKey,
  canEdit,
  drawing,
  editingGeometry = false,
  onToggleDrawing,
  onSelectArea,
  onDeleteArea,
}: ConstructionSiteAreasSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="geometry-panel-content">
      <ConstructionSiteSectionTitle
        label={t('constructionSites.sections.areas')}
      />
      {canEdit && drawing && (
        <div className="geometry-mode-actions" role="group" aria-label={t('geometry.controls')}>
          <Button htmlType="button" size="small" danger icon={<CloseOutlined aria-hidden />}
            aria-pressed={drawing} onClick={onToggleDrawing}>
            {t('geometry.cancelDrawing')}
          </Button>
        </div>
      )}
      <GeometryList
        areas={areas}
        canEdit={canEdit}
        canDelete={canEdit && editingGeometry && !drawing}
        selectedAreaKey={selectedAreaKey}
        onSelect={onSelectArea}
        onDelete={onDeleteArea}
        onAdd={canEdit && !drawing ? onToggleDrawing : undefined}
      />
    </div>
  )
}
