import { FilterOutlined } from '@ant-design/icons'
import { Button, Popover, Tooltip } from 'antd'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './filters.css'

interface FilterPopoverProps<T> {
  value: T
  onApply: (value: T) => void
  children: (draft: T, update: (patch: Partial<T>) => void) => ReactNode
}

export function FilterPopover<T>({ value, onApply, children }: FilterPopoverProps<T>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const titleId = useId()

  const changeOpen = (next: boolean) => {
    if (next) {
      setDraft(value)
    }
    setOpen(next)
  }

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={changeOpen}
      destroyOnHidden
      content={
        <section className="filter-popover" aria-labelledby={titleId}>
          <strong id={titleId}>{t('filters.title')}</strong>
          <div className="filter-popover-fields">
            {children(draft, (patch) => setDraft((current) => ({ ...current, ...patch })))}
          </div>
          <footer className="filter-popover-actions">
            <Button onClick={() => changeOpen(false)}>{t('filters.cancel')}</Button>
            <Button
              type="primary"
              onClick={() => {
                onApply(draft)
                changeOpen(false)
              }}
            >
              {t('filters.apply')}
            </Button>
          </footer>
        </section>
      }
    >
      <Tooltip title={t('filters.add')}>
        <Button
          icon={<FilterOutlined aria-hidden />}
          aria-label={t('filters.add')}
          aria-expanded={open}
        />
      </Tooltip>
    </Popover>
  )
}
