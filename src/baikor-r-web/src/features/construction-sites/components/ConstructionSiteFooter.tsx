import { ArrowLeftOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Alert, Button, Popconfirm } from 'antd'
import { useTranslation } from 'react-i18next'
import type { ConstructionSiteSummary } from '../types'

interface SharedFooterProps {
  selectedSite: ConstructionSiteSummary | null
  canEdit: boolean
  deleting: boolean
  onDelete: () => Promise<void>
}

type ConstructionSiteFooterProps = SharedFooterProps & (
  | { mode: 'readonly'; onEdit: () => void }
  | {
    mode: 'edit' | 'create'
    hasChanges: boolean
    drawing: boolean
    saving: boolean
    feedback: { type: 'error' | 'info'; message: string } | null
    onDiscard: () => void
  }
)

export function ConstructionSiteFooter(props: ConstructionSiteFooterProps) {
  const { t } = useTranslation()
  const { selectedSite, canEdit, deleting, onDelete } = props
  const saving = props.mode !== 'readonly' && props.saving
  const actionsDisabled = saving || deleting || !canEdit

  return (
    <footer className="record-footer">
      {props.mode !== 'readonly' && props.feedback && (
        <Alert className="save-message" type={props.feedback.type} title={props.feedback.message} showIcon />
      )}
      <div className="record-footer-actions">
        <div className="record-footer-primary">
          {props.mode === 'readonly'
            ? canEdit && <Button htmlType="button" icon={<EditOutlined aria-hidden />}
              disabled={deleting} onClick={props.onEdit}>{t('record.edit')}</Button>
            : props.mode === 'create' || props.hasChanges
              ? <>
                <Popconfirm title={t('record.discardTitle')} description={t('record.discardMessage')}
                  okText={t('constructionSites.discard')} cancelText={t('workspace.stay')}
                  disabled={actionsDisabled} okButtonProps={{ disabled: actionsDisabled }}
                  onConfirm={props.onDiscard} placement="topLeft"
                  classNames={{ root: 'record-action-confirmation' }}>
                  <Button className="discard-action" htmlType="button" disabled={actionsDisabled}>
                    {t('constructionSites.discard')}
                  </Button>
                </Popconfirm>
                <Button className="save-action" type="primary" htmlType="submit" loading={saving}
                  disabled={actionsDisabled || props.drawing}>
                  {props.mode === 'create' ? t('record.create') : t('constructionSites.save')}
                </Button>
              </>
              : <Button htmlType="button" icon={<ArrowLeftOutlined aria-hidden />}
                disabled={saving || deleting} onClick={props.onDiscard}>
                {t('record.back')}
              </Button>}
        </div>
        {canEdit && props.mode !== 'create' && selectedSite && <Popconfirm
          title={t('constructionSites.delete.confirmTitle')}
          description={t('constructionSites.delete.confirmMessage', { title: selectedSite.title })}
          okText={t('constructionSites.delete.action')} cancelText={t('common.cancel')}
          okButtonProps={{ danger: true, disabled: actionsDisabled }} cancelButtonProps={{ disabled: deleting }}
          disabled={actionsDisabled} onConfirm={onDelete} placement="topRight"
          classNames={{ root: 'record-action-confirmation' }}>
          <Button className="record-footer-delete" danger type="text" htmlType="button"
            icon={<DeleteOutlined aria-hidden />} loading={deleting} disabled={actionsDisabled}
            title={t('constructionSites.delete.action')} aria-label={t('constructionSites.delete.action')} />
        </Popconfirm>}
      </div>
    </footer>
  )
}
