import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import type { EditorArea } from '../types'
import { ConstructionSiteSectionTitle } from './ConstructionSiteSectionTitle'
import { GeometryList } from './GeometryList'

interface ConstructionSiteAreasSectionProps {
  areas: EditorArea[]
  selectedAreaKey: string | null
  canEdit: boolean
  drawing: boolean
  onToggleDrawing: () => void
  onSelectArea: (key: string) => void
  onDeleteArea: (key: string) => void
}

export function ConstructionSiteAreasSection({
  areas,
  selectedAreaKey,
  canEdit,
  drawing,
  onToggleDrawing,
  onSelectArea,
  onDeleteArea,
}: ConstructionSiteAreasSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="geometry-panel-content">
      <ConstructionSiteSectionTitle
        label={t('constructionSites.sections.areas')}
        action={(
          <Tooltip
            title={drawing ? t('constructionSites.cancelDrawing') : t('constructionSites.draw')}
            open={drawing ? false : undefined}
          >
            <Button
              className="section-icon-action"
              htmlType="button"
              size="small"
              shape="circle"
              danger={drawing}
              icon={drawing ? <CloseOutlined /> : <PlusOutlined />}
              disabled={!canEdit}
              aria-label={drawing ? t('constructionSites.cancelDrawing') : t('constructionSites.draw')}
              onClick={onToggleDrawing}
            />
          </Tooltip>
        )}
      />
      <GeometryList
        areas={areas}
        canEdit={canEdit}
        selectedAreaKey={selectedAreaKey}
        onSelect={onSelectArea}
        onDelete={onDeleteArea}
      />
    </div>
  )
}
