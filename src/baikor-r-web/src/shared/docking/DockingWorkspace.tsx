import { ReloadOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { calculateGeometry } from './geometry'
import { calculateDragPreview, floatingPanelRect, resolveDragTarget } from './dragPreview'
import { createLayout, dockPanel, setPanelCollapsed, setSplitRatio } from './layout'
import type { DockEdge, DockNode } from './layout'
import { PanelHeader } from './PanelHeader'
import { SplitHandle } from './SplitHandle'
import { useDockingLayout } from './useDockingLayout'
import { usePanelDrag } from './usePanelDrag'
import './docking.css'

export interface DockingPanel {
  id: string
  title: string
  icon: ReactNode
  content: ReactNode
  minWidth?: number
  minHeight?: number
}
export interface DockingWorkspaceHandle { showPanel: (id: string) => void }
interface DockingWorkspaceProps {
  panels: DockingPanel[]
  defaultLayout: DockNode
  storageKey: string
  compact: boolean
  onLayoutChange?: () => void
}

/** The tree owns geometry, the registry owns content. Wrappers never change parents. */
export const DockingWorkspace = forwardRef<DockingWorkspaceHandle, DockingWorkspaceProps>(function DockingWorkspace(
  { panels, defaultLayout, storageKey, compact, onLayoutChange }, ref,
) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const railButtons = useRef<Record<string, HTMLElement | null>>({})
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [activeId, setActiveId] = useState(panels[0]?.id)
  const [announcement, setAnnouncement] = useState('')
  const panelSignature = JSON.stringify(panels.map(panel => panel.id))
  const panelIds = useMemo<string[]>(() => JSON.parse(panelSignature), [panelSignature])
  const { layout, update, persist } = useDockingLayout(storageKey, defaultLayout, panelIds)
  const visible = panels.filter(panel => !layout.collapsed.includes(panel.id))
  const selectedId = visible.some(panel => panel.id === activeId) ? activeId : visible[0]?.id
  const minimums = Object.fromEntries(panels.map(panel => [panel.id, { minWidth: panel.minWidth ?? 280, minHeight: panel.minHeight ?? 180 }]))
  const geometry = calculateGeometry(layout, size, minimums)

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const showPanel = useCallback((id: string) => {
    if (!panelIds.includes(id)) return
    update(current => setPanelCollapsed(current, id, false))
    setActiveId(id)
  }, [panelIds, update])
  useImperativeHandle(ref, () => ({ showPanel }), [showPanel])

  const movePanel = (id: string, targetId: string, edge: DockEdge) => {
    update(current => dockPanel(current, id, targetId, edge))
    setAnnouncement(t('dock.moved', { title: panels.find(panel => panel.id === id)?.title }))
  }
  const { drag, eventsFor } = usePanelDrag(host, geometry.panels, !compact,
    (id, target) => movePanel(id, target.panelId, target.edge),
    (point, sourceId, previousTarget) => resolveDragTarget(point, layout, size, minimums, sourceId, previousTarget))
  const dragging = !compact && Boolean(drag?.started)
  const target = dragging ? drag?.target : null
  const projection = dragging && drag ? calculateDragPreview(layout, size, minimums, drag.sourceId, target ?? null) : null
  const preview = projection?.placeholder
  const displayGeometry = projection?.geometry ?? geometry
  const floating = dragging && drag ? floatingPanelRect(drag.origin, drag.start, drag.point) : null
  const sourcePanel = dragging ? panels.find(panel => panel.id === drag?.sourceId) : null
  const dropLabel = target ? t(`dock.drop${target.edge[0].toUpperCase()}${target.edge.slice(1)}`, { title: panels.find(panel => panel.id === target.panelId)?.title }) : ''
  const targets = visible.map(({ id, title }) => ({ id, title }))

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => onLayoutChange?.())
    return () => window.cancelAnimationFrame(frame)
  }, [layout, size.width, size.height, compact, selectedId, target?.panelId, target?.edge, dragging, onLayoutChange])

  const collapsePanel = (panel: DockingPanel) => {
    update(current => setPanelCollapsed(current, panel.id, true))
    setAnnouncement(t('dock.hidden', { title: panel.title }))
    window.requestAnimationFrame(() => railButtons.current[panel.id]?.focus())
  }
  const reset = () => {
    update(() => createLayout(defaultLayout, panelIds))
    setActiveId(panels[0]?.id)
    setAnnouncement(t('dock.layoutReset'))
  }

  return <section className={`docking-workspace${compact ? ' docking-compact' : ''}${dragging ? ' docking-is-dragging' : ''}`} aria-label={t('dock.workspace')}>
    <div className={`docking-canvas${preview ? ' docking-has-preview' : ''}`} ref={host}>
      {/* Registry order stays fixed even when tree order changes. */}
      {panels.map(panel => {
        const isFloating = dragging && drag?.sourceId === panel.id
        const rect = isFloating ? floating : displayGeometry.panels[panel.id]
        const hidden = !rect || (compact && selectedId !== panel.id)
        return <section key={panel.id} data-panel-id={panel.id} data-dragging={isFloating || undefined}
          className={`docking-panel${isFloating ? ' is-floating' : ''}${target?.panelId === panel.id ? ' is-drop-target' : ''}`} hidden={hidden}
          aria-labelledby={`dock-title-${panel.id}`} style={compact ? { inset: 0 } : rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined}>
          <PanelHeader id={panel.id} title={panel.title} icon={panel.icon} targets={targets.filter(target => target.id !== panel.id)} compact={compact}
            onMove={(targetId, edge) => movePanel(panel.id, targetId, edge)} onCollapse={() => collapsePanel(panel)} {...eventsFor(panel.id)} />
          <div className="docking-panel-content">{panel.content}</div>
        </section>
      })}
      {!compact && !dragging && geometry.splits.map(split => <SplitHandle key={split.id} split={split}
        onChange={(ratio, commit) => update(current => setSplitRatio(current, split.id, ratio), commit)} onCommit={persist} />)}
      {visible.length === 0 && <div className="docking-empty"><strong>{t('dock.allCollapsed')}</strong><p>{t('dock.restoreHint')}</p><Button onClick={reset} icon={<ReloadOutlined />}>{t('dock.reset')}</Button></div>}
      {preview && sourcePanel && <div className="docking-drop-preview" aria-hidden
        style={{ left: preview.x, top: preview.y, width: preview.width, height: preview.height }}>
        <span className="docking-drop-preview-icon">{sourcePanel.icon}</span>
        <strong>{sourcePanel.title}</strong><span>{dropLabel}</span>
      </div>}
    </div>
    <aside className="docking-rail" aria-label={t('dock.panels')}>
      <div className="docking-rail-panels">{panels.map(panel => {
        const collapsed = layout.collapsed.includes(panel.id)
        const shown = !collapsed && (!compact || selectedId === panel.id)
        const label = compact || collapsed ? t('dock.restore', { title: panel.title }) : t('dock.collapse', { title: panel.title })
        return <Tooltip title={label} placement="left" key={panel.id}>
          <Button ref={button => { railButtons.current[panel.id] = button }} className={`docking-rail-button${shown ? ' is-visible' : ''}`} type="text"
            aria-label={label} aria-pressed={shown} icon={panel.icon} onClick={() => {
              if (!compact && !collapsed) collapsePanel(panel)
              else { showPanel(panel.id); setAnnouncement(t('dock.restored', { title: panel.title })) }
            }} />
        </Tooltip>
      })}</div>
      <Tooltip title={t('dock.reset')} placement="left"><Button type="text" icon={<ReloadOutlined />} aria-label={t('dock.reset')} onClick={reset} /></Tooltip>
    </aside>
    <span className="docking-sr-only" id="docking-drag-instructions">{t('dock.dragHint')}</span>
    <span className="docking-sr-only" role="status" aria-live="polite" aria-atomic="true">{dragging ? dropLabel : announcement}</span>
  </section>
})
