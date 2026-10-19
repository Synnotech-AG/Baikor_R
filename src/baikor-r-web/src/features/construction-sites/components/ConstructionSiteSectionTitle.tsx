import { ExclamationCircleFilled } from '@ant-design/icons'
import { Tooltip } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface ConstructionSiteSectionTitleProps {
  label: ReactNode
  meta?: ReactNode
  action?: ReactNode
  hasError?: boolean
}

export function ConstructionSiteSectionTitle({
  label,
  meta,
  action,
  hasError = false,
}: ConstructionSiteSectionTitleProps) {
  const { t } = useTranslation()

  return (
    <div className={`editor-section-title${hasError ? ' editor-section-title-error' : ''}`}>
      <span className="editor-section-title-label">
        {label}
        {hasError && (
          <Tooltip title={t('validation.sectionHasErrors')}>
            <ExclamationCircleFilled className="editor-section-title-error-icon" />
          </Tooltip>
        )}
      </span>
      {(meta || action) && (
        <span className="editor-section-title-trailing">
          {meta && <span className="editor-section-title-meta">{meta}</span>}
          {action && <span className="editor-section-title-action">{action}</span>}
        </span>
      )}
    </div>
  )
}
