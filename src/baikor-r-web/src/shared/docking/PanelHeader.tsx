import { DragOutlined, MinusOutlined } from '@ant-design/icons'
import { Button, Dropdown, Tooltip } from 'antd'
import type { PointerEvent, ReactNode, MouseEvent } from 'react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { DockEdge } from './layout'

interface PanelHeaderProps {
  id: string
  title: string
  icon: ReactNode
  targets: { id: string; title: string }[]
  compact: boolean
  onMove: (targetId: string, edge: DockEdge) => void
  onCollapse: () => void
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
  onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => void
  onClickCapture: (event: MouseEvent<HTMLButtonElement>) => void
}

export function PanelHeader({ id, title, icon, targets, compact, onMove, onCollapse, ...dragEvents }: PanelHeaderProps) {
  const { t } = useTranslation()
  const handle = useRef<HTMLElement | null>(null)
  const edges: DockEdge[] = ['left', 'right', 'top', 'bottom']
  return <header className="docking-panel-header">
    <span className="docking-panel-icon" aria-hidden>{icon}</span>
    <strong id={`dock-title-${id}`} title={title}>{title}</strong>
    {!compact && <Dropdown autoFocus trigger={['click']} disabled={targets.length === 0} menu={{
      items: targets.map((target) => ({ key: target.id, label: t('dock.moveTo', { title: target.title }),
        children: edges.map((edge) => ({ key: JSON.stringify([target.id, edge]), label: t(`dock.${edge}`) })),
      })),
      onClick: ({ key }) => {
        const [targetId, edge] = JSON.parse(key)
        onMove(targetId, edge)
        window.requestAnimationFrame(() => handle.current?.focus())
      },
    }}>
      <Button ref={button => { handle.current = button }} type="text" size="small" className="docking-drag-handle" icon={<DragOutlined />} aria-haspopup="menu"
        aria-label={t('dock.movePanel', { title })} aria-describedby="docking-drag-instructions"
        title={t('dock.dragHint')} disabled={targets.length === 0} {...dragEvents} />
    </Dropdown>}
    <Tooltip title={t('dock.collapse', { title })}>
      <Button type="text" size="small" icon={<MinusOutlined />} aria-label={t('dock.collapse', { title })} onClick={onCollapse} />
    </Tooltip>
  </header>
}
