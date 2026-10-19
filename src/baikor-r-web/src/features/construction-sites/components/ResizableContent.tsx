import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface ResizableContentProps extends PropsWithChildren {
  map: ReactNode
  onResize: () => void
}

export function ResizableContent({ map, children, onResize }: ResizableContentProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null)
  const [tableHeight, setTableHeight] = useState(330)

  useEffect(onResize, [onResize, tableHeight])

  const resize = (clientY: number) => {
    if (!resizeStartRef.current || !panelRef.current) return
    const maximumHeight = Math.max(220, panelRef.current.clientHeight - 268)
    const nextHeight = resizeStartRef.current.height + resizeStartRef.current.y - clientY
    setTableHeight(Math.min(maximumHeight, Math.max(220, nextHeight)))
  }

  const resizeWithKeyboard = (direction: 'up' | 'down') => {
    if (!panelRef.current) return
    const maximumHeight = Math.max(220, panelRef.current.clientHeight - 268)
    setTableHeight((height) => Math.min(maximumHeight, Math.max(220, height + (direction === 'up' ? 24 : -24))))
  }

  return (
    <div ref={panelRef} className="content-panel" style={{ gridTemplateRows: `minmax(260px, 1fr) 8px ${tableHeight}px` }}>
      {map}
      <div
        className="splitter"
        role="separator"
        aria-label={t('constructionSites.map.resize')}
        aria-orientation="horizontal"
        aria-valuemin={220}
        aria-valuenow={Math.round(tableHeight)}
        tabIndex={0}
        onPointerDown={(event) => {
          resizeStartRef.current = { y: event.clientY, height: tableHeight }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => resize(event.clientY)}
        onPointerUp={(event) => {
          resizeStartRef.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => { resizeStartRef.current = null }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            resizeWithKeyboard(event.key === 'ArrowUp' ? 'up' : 'down')
          }
        }}
      />
      {children}
    </div>
  )
}
