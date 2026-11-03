import { EllipsisOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Popover, Space } from 'antd'
import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoutePathResponse } from './types'

interface RouteActionsProps {
  route: RoutePathResponse
  canEdit: boolean
  ready: boolean
  restoring: boolean
  deactivating: boolean
  onEdit: () => void
  onRestore: () => void
  onDeactivate: () => void
}

export function RouteActions({
  route,
  canEdit,
  ready,
  restoring,
  deactivating,
  onEdit,
  onRestore,
  onDeactivate,
}: RouteActionsProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = () => {
    setConfirmOpen(false)
    setOpen(false)
    triggerRef.current?.focus()
  }
  const dismissOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }
  if (!canEdit) {
    return null
  }
  return (
    <footer className="route-footer">
      {canEdit && !route.isSuppressed && !route.sourceId && (
        <Button disabled={!ready || deactivating} onClick={onEdit}>
          {t('routes.edit')}
        </Button>
      )}
      {canEdit && route.isSuppressed && (
        <Button disabled={!ready} loading={restoring} onClick={onRestore}>
          {t('routes.restore')}
        </Button>
      )}
      {canEdit && !route.isSuppressed && (
        <Popover
          trigger="click"
          placement="topRight"
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) {
              setConfirmOpen(false)
            }
          }}
          content={
            <Space orientation="vertical" align="start" onKeyDown={dismissOnEscape}>
              <Popconfirm
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={t('routes.removeTitle')}
                description={
                  <p className="route-delete-description">{t('routes.removeMessage')}</p>
                }
                onConfirm={() => {
                  close()
                  onDeactivate()
                }}
                onCancel={() => setConfirmOpen(false)}
                okText={t('routes.remove')}
                cancelText={t('common.cancel')}
              >
                <Button type="text" danger disabled={!ready || deactivating}>
                  {t('routes.remove')}
                </Button>
              </Popconfirm>
            </Space>
          }
        >
          <Button
            ref={triggerRef}
            className="route-more-actions"
            icon={<EllipsisOutlined />}
            aria-label={t('routes.moreActions')}
            disabled={!ready || deactivating}
            loading={deactivating}
            onKeyDown={dismissOnEscape}
          />
        </Popover>
      )}
    </footer>
  )
}
