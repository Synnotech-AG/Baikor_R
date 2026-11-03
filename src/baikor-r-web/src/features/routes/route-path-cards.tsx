import { AimOutlined, DeleteOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Tag, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../shared/formatters'
import type { RoutePathResponse } from './types'
interface RoutePathCardsProps {
  route: RoutePathResponse
  selectedPathId: string | null
  onSelect: (pathId: string) => void
  canRestore?: boolean
  restoring?: boolean
  onRestore?: (pathId: string) => void
  canDelete?: boolean
  deleting?: boolean
  onDelete?: (pathId: string) => void
  includeDeleted?: boolean
}
export function RoutePathCards({
  route,
  selectedPathId,
  onSelect,
  canRestore = false,
  restoring = false,
  onRestore,
  canDelete = false,
  deleting = false,
  onDelete,
  includeDeleted = false,
}: RoutePathCardsProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const visiblePaths = route.paths.filter((path) => includeDeleted || !path.isSuppressed)
  return (
    <section className="route-paths" aria-label={t('routes.paths')}>
      <h4>{t('routes.pathCount', { count: visiblePaths.length })}</h4>
      {visiblePaths.map((path) => (
        <section
          className={`route-path-card${selectedPathId === path.id ? ' route-path-selected' : ''}`}
          key={path.id}
        >
          <div className="route-path-heading">
            <h4>{path.title}</h4>
            {path.isSuppressed && <Tag>{t('routes.hidden')}</Tag>}
            {path.isSuppressed && !route.isSuppressed && canRestore && (
              <Popconfirm
                title={t('routes.restorePathTitle')}
                description={t('routes.restorePathHint')}
                onConfirm={() => onRestore?.(path.id)}
                okText={t('routes.restorePath')}
                cancelText={t('common.cancel')}
              >
                <Button size="small" loading={restoring} disabled={restoring || deleting}>
                  {t('routes.restorePath')}
                </Button>
              </Popconfirm>
            )}
            <div className="route-path-actions">
              <Tooltip title={t('routes.focus')}>
                <Button
                  type="text"
                  size="small"
                  icon={<AimOutlined />}
                  aria-label={t('routes.focusPath', { title: path.title })}
                  aria-pressed={selectedPathId === path.id}
                  disabled={route.isSuppressed || path.isSuppressed}
                  onClick={() => onSelect(path.id)}
                />
              </Tooltip>
              {!route.isSuppressed && !path.isSuppressed && canDelete && onDelete && (
                <Popconfirm
                  title={t('routes.deletePathTitle')}
                  description={t('routes.deletePathHint')}
                  onConfirm={() => onDelete(path.id)}
                  okText={t('routes.deletePath')}
                  cancelText={t('common.cancel')}
                >
                  <Tooltip title={t('routes.deletePath')}>
                    <Button
                      danger
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      aria-label={t('routes.deletePathNamed', { title: path.title })}
                      loading={deleting}
                      disabled={deleting || restoring}
                    />
                  </Tooltip>
                </Popconfirm>
              )}
            </div>
          </div>
          {path.versions.map((version) => (
            <p
              className="route-path-availability"
              key={version.id}
              aria-label={t('routes.calendar')}
            >
              {version.hasOperatingCalendar
                ? version.periods.length
                  ? version.periods
                      .map((period) =>
                        period.from === period.to
                          ? formatDate(period.from, locale)
                          : `${formatDate(period.from, locale)} – ${formatDate(period.to, locale)}`,
                      )
                      .join(' · ')
                  : t('routes.noOperation')
                : version.validFrom || version.validTo
                  ? `${version.validFrom ? formatDate(version.validFrom, locale) : '…'} – ${version.validTo ? formatDate(version.validTo, locale) : '…'}`
                  : t('routes.daily')}
            </p>
          ))}
        </section>
      ))}
    </section>
  )
}
