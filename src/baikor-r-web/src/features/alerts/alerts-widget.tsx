import { ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, App, Button, Empty, Modal, Spin, Table, Tag } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../api/errors'
import { formatDate } from '../../shared/formatters'
import {
  getAlert,
  getAlertEvidence,
  getAlerts,
  getRouteConflictRule,
  useReviewAlertEndpoint,
  useSaveAlertRuleEndpoint,
  useStartAlertScanEndpoint,
} from './api'
import { AlertDetailsPane } from './alert-details-pane'
import { AlertFiltersComponent } from './alert-filters'
import {
  alertHasMapTarget,
  alertPaneMode,
  clampAlertDivider,
  defaultAlertFilters,
  toHandlingRequest,
  toHistoricalAlert,
} from './alert-model'
import { AlertRuleSettings } from './alert-rule-settings'
import { AlertDetectionHealth, AlertRecheckAction } from './alert-detection-controls'
import { RelatedAlertModal } from './related-alert-modal'
import type {
  AlertDetails,
  AlertFilters,
  AlertHandling,
  AlertSummary,
  AlertSelectionOrigin,
  AlertScan,
  DetectionStatus,
  PagedAlerts,
  RouteConflictRule,
} from './types'
import './alerts-widget.css'

export interface AlertsWidgetProps {
  canEdit: boolean
  canAdmin: boolean
  antiforgeryReady: boolean
  onFocusAlert: (alert: AlertDetails, origin?: AlertSelectionOrigin) => void
  onOpenConstructionSite: (id: string, alert?: AlertDetails) => void
  onOpenRoute: (id: string) => void
  refreshToken?: number
  selectedAlertId?: string | null
  selectionToken?: number
  onChanged?: () => void
  filters?: AlertFilters
  onFiltersChange?: (filters: AlertFilters) => void
  detectionStatus?: DetectionStatus | null
  detectionStatusUnavailable?: boolean
  onRefreshDetectionStatus?: () => void
  onScanStarted?: (scan: AlertScan) => void
}

const dividerStorageKey = 'baikor-r.alerts.divider'
function readDivider() {
  try {
    const saved = localStorage.getItem(dividerStorageKey)
    return saved === null ? 46 : clampAlertDivider(Number(saved))
  } catch {
    return 46
  }
}

export function AlertsWidget({
  canEdit,
  canAdmin,
  antiforgeryReady,
  onFocusAlert,
  onOpenConstructionSite,
  onOpenRoute,
  refreshToken = 0,
  selectedAlertId = null,
  selectionToken = 0,
  onChanged,
  filters: controlledFilters,
  onFiltersChange,
  detectionStatus: status = null,
  detectionStatusUnavailable: statusError = false,
  onRefreshDetectionStatus,
  onScanStarted,
}: AlertsWidgetProps) {
  const { t, i18n } = useTranslation()
  const { notification } = App.useApp()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'
  const [localFilters, setLocalFilters] = useState<AlertFilters>(defaultAlertFilters)
  const filters = controlledFilters ?? localFilters
  const [page, setPage] = useState(1)
  const [list, setList] = useState<PagedAlerts | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AlertDetails | null>(null)
  const [relatedAlertId, setRelatedAlertId] = useState<string | null>(null)
  const [historicalRevision, setHistoricalRevision] = useState<number | null>(null)
  const [historical, setHistorical] = useState<AlertDetails | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsStale, setDetailsStale] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [detailRefresh, setDetailRefresh] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [rule, setRule] = useState<RouteConflictRule | null>(null)
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [divider, setDivider] = useState(readDivider)
  const [width, setWidth] = useState(900)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)
  const focusSelectionRef = useRef(false)
  const focusRef = useRef(onFocusAlert)
  const statusRef = useRef<DetectionStatus | null>(null)
  const selectedIdRef = useRef(selectedId)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  selectedIdRef.current = selectedId
  const previousRefreshTokenRef = useRef(refreshToken)
  const previousListFiltersRef = useRef(filters)
  focusRef.current = onFocusAlert
  const reviewEndpoint = useReviewAlertEndpoint()
  const ruleEndpoint = useSaveAlertRuleEndpoint()
  const scanEndpoint = useStartAlertScanEndpoint()
  const mode = alertPaneMode(width, selectedId !== null)
  const writable = canEdit && antiforgeryReady
  const adminWritable = canAdmin && antiforgeryReady

  useEffect(() => {
    if (!selectedAlertId) {
      return
    }
    focusSelectionRef.current = false
    setError(null)
    setSelected(null)
    setSelectedId(selectedAlertId)
    setDetailRefresh((value) => value + 1)
  }, [selectedAlertId, selectionToken])

  useEffect(() => {
    if (refreshToken !== previousRefreshTokenRef.current) {
      previousRefreshTokenRef.current = refreshToken
      if (selectedId) {
        setDetailsStale(true)
      }
    }
  }, [refreshToken, selectedId])

  const describeError = useCallback(
    (caught: unknown) => {
      const parsed = parseApiError(caught, t('alerts.failed'))
      return parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
    },
    [t, i18n],
  )
  const describeErrorRef = useRef(describeError)
  describeErrorRef.current = describeError
  const updateFilter = (next: Partial<AlertFilters>) => {
    focusSelectionRef.current = false
    const updated = { ...filters, ...next }
    if (onFiltersChange) {
      onFiltersChange(updated)
    } else {
      setLocalFilters(updated)
    }
    setPage(1)
  }
  const refreshAll = () => {
    setRefresh((value) => value + 1)
    setDetailRefresh((value) => value + 1)
    onRefreshDetectionStatus?.()
  }

  useEffect(() => {
    const element = workspaceRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 900))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(dividerStorageKey, String(divider))
    } catch {
      // The divider still works when browser storage is unavailable.
    }
  }, [divider])

  useEffect(() => {
    const controller = new AbortController()
    if (filters !== previousListFiltersRef.current) {
      focusSelectionRef.current = false
      setList(null)
      previousListFiltersRef.current = filters
    }
    setLoading(true)
    void getAlerts(filters, page, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setList(result)
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(describeErrorRef.current(caught))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [filters, page, refresh, refreshToken, describeError])

  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    const controller = new AbortController()
    setDetailsLoading(true)
    void getAlert(selectedId, controller.signal)
      .then((details) => {
        if (controller.signal.aborted) {
          return
        }
        setSelected(details)
        setDetailsStale(false)
        if (focusSelectionRef.current && alertHasMapTarget(details)) {
          focusRef.current(details)
        }
        focusSelectionRef.current = false
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(describeErrorRef.current(caught))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailsLoading(false)
        }
      })
    return () => controller.abort()
  }, [selectedId, detailRefresh])

  useEffect(() => {
    setHistoricalRevision(null)
    setHistorical(null)
    setHistoryError(null)
  }, [selectedId])

  useEffect(() => {
    if (historicalRevision === null || !selectedId || !selectedRef.current) {
      return
    }
    const controller = new AbortController()
    const current = selectedRef.current
    setHistorical(null)
    setHistoryError(null)
    void getAlertEvidence(selectedId, historicalRevision, controller.signal)
      .then((evidence) => {
        if (!controller.signal.aborted) {
          setHistorical(toHistoricalAlert(current, evidence))
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setHistoryError(describeErrorRef.current(caught))
        }
      })
    return () => controller.abort()
  }, [selectedId, historicalRevision])

  useEffect(() => {
    if (!status) {
      return
    }
    if (
      status.pendingCount > 0 ||
      statusRef.current?.pendingCount ||
      status.lastEvaluatedAt !== statusRef.current?.lastEvaluatedAt
    ) {
      setRefresh((value) => value + 1)
      if (selectedIdRef.current) {
        setDetailsStale(true)
      }
    }
    statusRef.current = status
  }, [status])

  useEffect(() => {
    if (!showSettings) {
      return
    }
    const controller = new AbortController()
    setRule(null)
    setRuleError(null)
    void getRouteConflictRule(controller.signal)
      .then(setRule)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setRuleError(describeError(caught))
        }
      })
    return () => controller.abort()
  }, [showSettings, describeError])

  const review = async (handling: AlertHandling, note: string) => {
    if (!selected || !writable || selected.supersededByAlertId || detailsStale) {
      return
    }
    try {
      await reviewEndpoint.execute(selected.id, toHandlingRequest(selected, handling, note))
      notification.success({ message: t('alerts.reviewed') })
      setError(null)
      refreshAll()
      onChanged?.()
    } catch (caught) {
      if (axios.isAxiosError(caught) && caught.response?.status === 409) {
        setError(t('alerts.reviewConflict'))
        setDetailRefresh((value) => value + 1)
        setRefresh((value) => value + 1)
      } else {
        setError(describeError(caught))
      }
    }
  }
  const saveRule = async () => {
    if (!rule || !adminWritable) {
      return
    }
    if (
      !Number.isFinite(rule.sensitivityMetres) ||
      rule.sensitivityMetres < 0 ||
      rule.sensitivityMetres > 1000 ||
      rule.eligibleStatuses.length === 0
    ) {
      setRuleError(t('alerts.invalidRule'))
      return
    }
    try {
      await ruleEndpoint.execute(rule)
      setShowSettings(false)
      notification.success({ message: t('alerts.ruleSaved') })
      refreshAll()
      onChanged?.()
    } catch (caught) {
      setRuleError(describeError(caught))
    }
  }
  const startScan = async () => {
    if (!adminWritable) {
      return
    }
    setRuleError(null)
    try {
      const scan = await scanEndpoint.execute()
      onScanStarted?.(scan)
      onChanged?.()
    } catch (caught) {
      setRuleError(describeError(caught))
    }
  }
  const select = (alert: AlertSummary) => {
    setError(null)
    focusSelectionRef.current = true
    if (alert.id === selectedId) {
      setDetailRefresh((value) => value + 1)
    } else {
      setSelected(null)
      setSelectedId(alert.id)
    }
  }
  const resize = (clientX: number) => {
    const bounds = workspaceRef.current?.getBoundingClientRect()
    if (bounds && dragRef.current) {
      setDivider(clampAlertDivider(((clientX - bounds.left) / bounds.width) * 100))
    }
  }
  const types = new Set(['routeConflict', ...(list?.items.map((alert) => alert.type) ?? [])])

  return (
    <section className="alerts-widget" aria-label={t('alerts.title')}>
      <div className="alert-toolbar">
        <AlertFiltersComponent filters={filters} onChange={updateFilter} types={[...types]} />
        {canAdmin && (
          <Button
            icon={<SettingOutlined />}
            aria-label={t('alerts.settings')}
            disabled={!antiforgeryReady}
            onClick={() => setShowSettings(true)}
          />
        )}
      </div>
      <AlertDetectionHealth status={status} unavailable={statusError} />
      {error && (
        <Alert
          className="alert-widget-error"
          type="error"
          showIcon
          title={error}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={refreshAll}>
              {t('alerts.refresh')}
            </Button>
          }
          closable
          onClose={() => setError(null)}
        />
      )}
      <div
        ref={workspaceRef}
        className={`alert-workspace alert-mode-${mode}`}
        style={
          mode === 'split'
            ? { gridTemplateColumns: `minmax(0, ${divider}fr) 8px minmax(0, ${100 - divider}fr)` }
            : undefined
        }
      >
        <div className="alert-list">
          <Table<AlertSummary>
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={list?.items ?? []}
            locale={{ emptyText: t('alerts.empty') }}
            columns={[
              {
                title: t('alerts.summary'),
                dataIndex: 'summary',
                render: (_: string, alert) => (
                  <div>
                    <Button
                      className="alert-summary-button"
                      type="link"
                      onClick={(event) => {
                        event.stopPropagation()
                        select(alert)
                      }}
                    >
                      {alert.summary}
                    </Button>
                    {alert.periods && alert.periods.length > 0 && (
                      <small>
                        {alert.periods[0].from
                          ? formatDate(alert.periods[0].from, locale)
                          : t('alerts.unbounded')}{' '}
                        –{' '}
                        {alert.periods[0].to
                          ? formatDate(alert.periods[0].to, locale)
                          : t('alerts.unbounded')}
                        {alert.periods.length > 1 && (
                          <> · {t('alerts.morePeriods', { count: alert.periods.length - 1 })}</>
                        )}
                      </small>
                    )}
                  </div>
                ),
              },
              {
                title: t('alerts.handling'),
                width: 132,
                render: (_: unknown, alert) => (
                  <>
                    <Tag color={alert.handling === 'open' ? 'blue' : 'default'}>
                      {t(`alerts.handling.${alert.handling}`)}
                    </Tag>
                    {alert.condition === 'cleared' && (
                      <small>{t('alerts.condition.cleared')}</small>
                    )}
                  </>
                ),
              },
            ]}
            rowClassName={(alert) => (alert.id === selectedId ? 'alert-selected-row' : '')}
            onRow={(alert) => ({ onClick: () => select(alert) })}
            pagination={{
              current: page,
              pageSize: 25,
              total: list?.totalCount ?? 0,
              showSizeChanger: false,
              onChange: setPage,
              size: 'small',
            }}
          />
        </div>
        <div
          className="alert-divider"
          role="separator"
          aria-label={t('alerts.resize')}
          aria-orientation="vertical"
          aria-valuemin={28}
          aria-valuemax={70}
          aria-valuenow={Math.round(divider)}
          tabIndex={mode === 'split' ? 0 : -1}
          onPointerDown={(event) => {
            dragRef.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => resize(event.clientX)}
          onPointerUp={(event) => {
            dragRef.current = false
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={() => {
            dragRef.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              setDivider((value) => clampAlertDivider(value + (event.key === 'ArrowLeft' ? -2 : 2)))
            }
          }}
        />
        <article className="alert-details">
          {mode === 'details' && (
            <Button className="alert-back" type="text" onClick={() => setSelectedId(null)}>
              {t('alerts.back')}
            </Button>
          )}
          {detailsLoading ? (
            <div className="alert-details-loading">
              <Spin />
            </div>
          ) : selected ? (
            <AlertDetailsPane
              alert={selected}
              canReview={writable}
              saving={reviewEndpoint.isLoading}
              stale={detailsStale}
              onRefresh={() => setDetailRefresh((value) => value + 1)}
              onReview={review}
              onFocus={onFocusAlert}
              onOpenConstructionSite={onOpenConstructionSite}
              onOpenRoute={onOpenRoute}
              onViewEvidence={setHistoricalRevision}
              onOpenRelatedAlert={setRelatedAlertId}
              onOpenCanonical={(id) => {
                setSelected(null)
                setSelectedId(id)
              }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('alerts.select')} />
          )}
        </article>
      </div>
      <Modal
        title={t('alerts.historicalEvidence')}
        open={historicalRevision !== null}
        onCancel={() => setHistoricalRevision(null)}
        footer={null}
        destroyOnHidden
        width={720}
      >
        {historyError ? (
          <Alert type="error" showIcon title={historyError} />
        ) : historical ? (
          <div className="alert-historical-details">
            <AlertDetailsPane
              alert={historical}
              historical
              canReview={false}
              saving={false}
              onFocus={onFocusAlert}
              onOpenConstructionSite={onOpenConstructionSite}
              onOpenRoute={onOpenRoute}
            />
          </div>
        ) : (
          <Spin />
        )}
      </Modal>
      <RelatedAlertModal
        alertId={relatedAlertId}
        onClose={() => setRelatedAlertId(null)}
        onOpenRelatedAlert={setRelatedAlertId}
        onOpenCanonical={(id) => {
          setRelatedAlertId(null)
          setSelected(null)
          setSelectedId(id)
        }}
        onFocus={onFocusAlert}
        onOpenConstructionSite={onOpenConstructionSite}
        onOpenRoute={onOpenRoute}
      />
      <Modal
        title={t('alerts.settings')}
        open={showSettings}
        onCancel={() => setShowSettings(false)}
        footer={null}
        destroyOnHidden
      >
        {ruleError && <Alert type="error" title={ruleError} showIcon />}
        {rule ? (
          <AlertRuleSettings
            rule={rule}
            enabled={adminWritable}
            saving={ruleEndpoint.isLoading}
            onChange={setRule}
            onSave={() => {
              void saveRule()
            }}
          />
        ) : (
          !ruleError && <Spin />
        )}
        <div className="alert-settings-maintenance">
          <AlertRecheckAction
            canAdmin={canAdmin}
            ready={adminWritable}
            pending={Boolean(status?.pendingCount)}
            loading={scanEndpoint.isLoading}
            onStart={() => {
              void startScan()
            }}
          />
        </div>
      </Modal>
    </section>
  )
}
