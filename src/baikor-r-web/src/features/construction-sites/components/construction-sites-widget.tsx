import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { clampSitesDivider, sitesDividerBounds, sitesPaneMode } from './sites-widget-model'
import './construction-sites-widget.css'

export interface ConstructionSitesWidgetProps {
  filters: ReactNode
  table: ReactNode
  details: ReactNode
  hasSelection: boolean
  actions?: ReactNode
  onBackToList: () => void
}

const dividerStorageKey = 'baikor-r.construction-sites.divider'

function readDivider() {
  try {
    const saved = localStorage.getItem(dividerStorageKey)
    return saved === null ? clampSitesDivider() : clampSitesDivider(Number(saved))
  } catch {
    return clampSitesDivider()
  }
}

export function ConstructionSitesWidget({
  filters,
  table,
  details,
  hasSelection,
  actions,
  onBackToList,
}: ConstructionSitesWidgetProps) {
  const { t } = useTranslation()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)
  const [divider, setDivider] = useState(readDivider)
  const [width, setWidth] = useState(0)
  const mode = sitesPaneMode(width, hasSelection)
  const dividerBounds = sitesDividerBounds(width)
  const visibleDivider = clampSitesDivider(divider, width)

  useEffect(() => {
    const element = workspaceRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(dividerStorageKey, String(divider))
    } catch {
      // The divider remains usable when browser storage is unavailable.
    }
  }, [divider])

  const resize = (clientX: number) => {
    const bounds = workspaceRef.current?.getBoundingClientRect()
    if (bounds && bounds.width >= 1100 && dragRef.current) {
      setDivider(
        clampSitesDivider(((clientX - bounds.left - 4) / (bounds.width - 8)) * 100, bounds.width),
      )
    }
  }

  return (
    <section className="construction-sites-widget" aria-label={t('workspace.heading')}>
      <div className="construction-sites-toolbar">
        <div className="construction-sites-widget-filters">{filters}</div>
        {actions && <div className="construction-sites-widget-actions">{actions}</div>}
      </div>
      <div
        ref={workspaceRef}
        className={`construction-sites-workspace construction-sites-mode-${mode}`}
        style={
          mode === 'split'
            ? {
                gridTemplateColumns: `minmax(560px, ${visibleDivider}fr) 8px minmax(400px, ${100 - visibleDivider}fr)`,
              }
            : undefined
        }
      >
        <div className="construction-sites-widget-list" hidden={mode === 'details'}>
          {table}
        </div>
        <div
          className="construction-sites-divider"
          role="separator"
          aria-label={t('workspace.resizeSites')}
          aria-orientation="vertical"
          aria-valuemin={Number(dividerBounds.min.toFixed(1))}
          aria-valuemax={Number(dividerBounds.max.toFixed(1))}
          aria-valuenow={Number(visibleDivider.toFixed(1))}
          tabIndex={mode === 'split' ? 0 : -1}
          hidden={mode !== 'split'}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return
            }
            dragRef.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => resize(event.clientX)}
          onPointerUp={(event) => {
            dragRef.current = false
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerCancel={() => {
            dragRef.current = false
          }}
          onLostPointerCapture={() => {
            dragRef.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              setDivider((value) =>
                clampSitesDivider(
                  clampSitesDivider(value, width) + (event.key === 'ArrowLeft' ? -2 : 2),
                  width,
                ),
              )
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              setDivider(event.key === 'Home' ? dividerBounds.min : dividerBounds.max)
            }
          }}
        />
        <div className="construction-sites-widget-details" hidden={mode === 'list'}>
          {mode === 'details' && (
            <Button
              className="construction-sites-back"
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={onBackToList}
            >
              {t('workspace.backToList')}
            </Button>
          )}
          <div className="construction-sites-widget-record">{details}</div>
        </div>
      </div>
    </section>
  )
}
