import {
  FileAddOutlined,
  SelectOutlined,
  TableOutlined,
  EnvironmentOutlined,
  BellOutlined,
  BranchesOutlined,
} from '@ant-design/icons'
import { yupResolver } from '@hookform/resolvers/yup'
import { Alert, App as AntApp, Button, Empty } from 'antd'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useCreateConstructionSiteEndpoint } from '../../api/endpoints/use-create-construction-site-endpoint'
import { useBulkDeleteConstructionSitesEndpoint } from '../../api/endpoints/use-bulk-delete-construction-sites-endpoint'
import { useDeleteConstructionSiteEndpoint } from '../../api/endpoints/use-delete-construction-site-endpoint'
import { useGetConstructionSitesEndpoint } from '../../api/endpoints/use-get-construction-sites-endpoint'
import { useGetConstructionSiteEndpoint } from '../../api/endpoints/use-get-construction-site-endpoint'
import { useUpdateConstructionSiteEndpoint } from '../../api/endpoints/use-update-construction-site-endpoint'
import { useRestoreConstructionSiteEndpoint } from '../../api/endpoints/use-restore-construction-site-endpoint'
import axios from 'axios'
import { parseApiError } from '../../api/errors'
import { DockingWorkspace } from '../../shared/docking/docking-workspace'
import type { DockNode } from '../../shared/docking/layout'
import { ConstructionSiteDetails } from './components/construction-site-details'
import { ConstructionSiteEditor } from './components/construction-site-editor'
import { ConstructionSiteFilters } from './components/construction-site-filters'
import { ConstructionSiteMap } from './components/construction-site-map'
import { ConstructionSitesTable } from './components/construction-sites-table'
import { ConstructionSitesWidget } from './components/construction-sites-widget'
import { RetainedConstructionSiteDetails } from './components/retained-construction-site-details'
import { editorRoles } from './constants'
import { useConstructionSiteMap } from './hooks/use-construction-site-map'
import { useWorkspaceRoutes } from './hooks/use-workspace-routes'
import { useWorkspaceAlerts } from './hooks/use-workspace-alerts'
import { getAlert } from '../alerts/api'
import { useDetectionStatus } from '../alerts/use-detection-status'
import { defaultAlertFilters } from '../alerts/alert-model'
import type { AlertFilters } from '../alerts/types'
import type { AlertDetails, AlertSelectionOrigin } from '../alerts/types'
import { RoutesWidget } from '../routes/routes-widget'
import { AlertsWidget } from '../alerts/alerts-widget'
import { AlertTimelineControl } from '../alerts/live/alert-timeline-control'
import { filterAlertsForWindow } from '../alerts/live/alert-timeline-model'
import { useAlertTimeline } from '../alerts/live/use-alert-timeline'
import type { MultiLineStringDto } from '../routes/types'
import type {
  ConstructionSiteFormValues,
  ConstructionSiteArchive,
  ConstructionSiteStatus,
  ConstructionSiteSummary,
  UserSession,
} from './types'
import { createConstructionSiteSchema } from './validation'
import { filterConstructionSites, toWriteRequest } from './workspace'
import { mergeConstructionSitePanels } from './site-dock-layout'
import { refreshSelectedSite } from './refresh-selected-site'
import type { NavigationGuard } from './workspace'
import './workspace.css'

interface ConstructionSitesPageProps {
  session: UserSession | null
  antiforgeryReady: boolean
  active?: boolean
  onRegisterNavigationGuard?: (guard: NavigationGuard | null) => void
}

const emptyForm: ConstructionSiteFormValues = {
  title: '',
  status: 'draft',
  plannedStart: '',
  plannedEnd: '',
  diversion: '',
  contacts: [],
  communications: [],
  metadata: [],
}

const defaultDockLayout: DockNode = {
  kind: 'split',
  id: 'overview-main',
  axis: 'vertical',
  ratio: 0.58,
  first: { kind: 'panel', id: 'sites' },
  second: { kind: 'panel', id: 'map' },
}

function siteFormValues(site: ConstructionSiteSummary): ConstructionSiteFormValues {
  return {
    title: site.title,
    status: site.status,
    plannedStart: site.plannedStart ?? '',
    plannedEnd: site.plannedEnd ?? '',
    diversion: site.diversion ?? '',
    contacts: site.contacts.map((item) => ({
      ...item,
      email: item.email ?? '',
      phone1: item.phone1 ?? '',
      phone2: item.phone2 ?? '',
    })),
    communications: site.communications.map((item) => ({ ...item, note: item.note ?? '' })),
    metadata: Object.entries(site.metadata ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, value })),
  }
}

export function ConstructionSitesPage({
  session,
  antiforgeryReady,
  active = true,
  onRegisterNavigationGuard,
}: ConstructionSitesPageProps) {
  const { t, i18n } = useTranslation()
  const { modal, notification } = AntApp.useApp()
  const locale = i18n.resolvedLanguage?.startsWith('de') ? 'de-DE' : 'en-US'
  const schema = useMemo(() => createConstructionSiteSchema(t), [t])
  const form = useForm<ConstructionSiteFormValues>({
    resolver: yupResolver(schema),
    defaultValues: emptyForm,
    mode: 'onTouched',
    shouldFocusError: false,
  })
  const [items, setItems] = useState<ConstructionSiteSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const loadSequenceRef = useRef(0)
  const [retainedSiteAlert, setRetainedSiteAlert] = useState<AlertDetails | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [recordMode, setRecordMode] = useState<'inspect' | 'edit' | 'create' | null>(null)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [searchTerm, setSearchTerm] = useState('')
  const [status, setStatus] = useState<ConstructionSiteStatus | 'all'>('all')
  const [period, setPeriod] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [includeUndated, setIncludeUndated] = useState(false)
  const [archive, setArchive] = useState<ConstructionSiteArchive>('active')
  const [loadFailed, setLoadFailed] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; message: string } | null>(null)
  const [routeRevision, setRouteRevision] = useState(0)
  const [detectionRevision, setDetectionRevision] = useState(0)
  const detection = useDetectionStatus(active, detectionRevision)
  const [alertFilters, setAlertFilters] = useState<AlertFilters>(() => ({ ...defaultAlertFilters }))
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [selectedRoutePathId, setSelectedRoutePathId] = useState<string | null>(null)
  const [routeSelectionToken, setRouteSelectionToken] = useState(0)
  const [focusSelectedRoute, setFocusSelectedRoute] = useState(true)
  const [routeDrawRequest, setRouteDrawRequest] = useState(0)
  const pendingRouteDrawingRef = useRef<((geometry: MultiLineStringDto) => void) | null>(null)
  const routeSelectionRef = useRef<(id: string, pathId?: string) => void>(() => undefined)
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [alertSelectionToken, setAlertSelectionToken] = useState(0)
  const alertSelectionRef = useRef<(id: string) => void>(() => undefined)
  const alertMapRequestRef = useRef<AbortController | null>(null)
  const {
    routes,
    loadFailed: routesFailed,
    reload: reloadRoutes,
  } = useWorkspaceRoutes(active, routeRevision)
  const selectFromMapRef = useRef<(id: string) => void>(() => undefined)
  const editingVersionRef = useRef<number | null>(null)
  const { execute: getConstructionSites, isLoading: loadingItems } =
    useGetConstructionSitesEndpoint()
  const { execute: getConstructionSite } = useGetConstructionSiteEndpoint()
  const { execute: createConstructionSite, isLoading: creating } =
    useCreateConstructionSiteEndpoint()
  const { execute: deleteConstructionSite, isLoading: deleting } =
    useDeleteConstructionSiteEndpoint()
  const { execute: bulkDeleteConstructionSites, isLoading: bulkDeleting } =
    useBulkDeleteConstructionSitesEndpoint()
  const { execute: updateConstructionSite, isLoading: updating } =
    useUpdateConstructionSiteEndpoint()
  const { execute: restoreConstructionSite, isLoading: restoring } =
    useRestoreConstructionSiteEndpoint()
  const canEdit = session?.roles.some((role) => editorRoles.includes(role)) ?? false
  const canAdmin = session?.roles.includes('baikor_admin') ?? false
  const selectedSite = items.find((item) => item.id === selectedId) ?? null
  const recordOpen = recordMode !== null
  const isEditing = recordMode === 'edit' || recordMode === 'create'
  const busy = creating || updating || deleting || bulkDeleting || restoring
  const scopedItems = useMemo(
    () =>
      items.filter(
        (site) => archive === 'all' || (archive === 'archived' ? site.isDeleted : !site.isDeleted),
      ),
    [items, archive],
  )
  const filteredItems = useMemo(
    () =>
      filterConstructionSites(
        scopedItems,
        {
          search: searchTerm,
          status,
          periodStart: period?.[0]?.format('YYYY-MM-DD') ?? null,
          periodEnd: period?.[1]?.format('YYYY-MM-DD') ?? null,
          includeUndated,
          archive,
        },
        locale,
      ),
    [scopedItems, searchTerm, status, period, includeUndated, locale, archive],
  )
  const mapEditor = useConstructionSiteMap({
    canEdit: canEdit && isEditing,
    constructionSites: filteredItems,
    selectedId,
    showSelectedGeometry: recordOpen || filteredItems.some((site) => site.id === selectedId),
    onSelectConstructionSite: (id) => selectFromMapRef.current(id),
    routes,
    canEditRoutes: canEdit && antiforgeryReady,
    onSelectRoute: (id, pathId) => routeSelectionRef.current(id, pathId),
    onSelectAlert: (id) => alertSelectionRef.current(id),
  })
  const {
    alerts: mapAlerts,
    loadFailed: alertsFailed,
    reload: reloadAlerts,
  } = useWorkspaceAlerts(
    active,
    detectionRevision,
    mapEditor.layerVisibility.alerts,
    alertFilters,
    detection.status,
  )
  const { setAlerts: setMapAlerts } = mapEditor
  const { clearAlertFocus } = mapEditor
  const timeline = useAlertTimeline({
    available: active && mapEditor.layerVisibility.alerts,
    mapElementRef: mapEditor.mapElementRef,
  })
  const timelineWindow = timeline.enabled ? timeline.window : null
  const timelineWindowRef = useRef(timelineWindow)
  timelineWindowRef.current = timelineWindow
  const visibleMapAlerts = useMemo(
    () => filterAlertsForWindow(mapAlerts, timelineWindow),
    [mapAlerts, timelineWindow],
  )
  const focusMapAlert = (
    alert: AlertDetails,
    focusGeometry = true,
    origin: AlertSelectionOrigin = 'current',
  ) => {
    if (filterAlertsForWindow([alert], timelineWindowRef.current).length === 0) {
      clearAlertFocus()
      return
    }
    mapEditor.focusAlert(alert, focusGeometry, origin)
  }
  const changeAlertFilters = useCallback(
    (filters: AlertFilters) => {
      alertMapRequestRef.current?.abort()
      clearAlertFocus()
      setAlertFilters(filters)
    },
    [clearAlertFocus],
  )
  useEffect(() => {
    alertMapRequestRef.current?.abort()
    clearAlertFocus()
  }, [timelineWindow, clearAlertFocus])
  useEffect(() => {
    if (!active || !mapEditor.layerVisibility.alerts) {
      alertMapRequestRef.current?.abort()
    }
  }, [active, mapEditor.layerVisibility.alerts])
  useEffect(() => setMapAlerts(visibleMapAlerts), [visibleMapAlerts, setMapAlerts])
  useEffect(() => () => alertMapRequestRef.current?.abort(), [])
  const {
    clearGeometry,
    loadAreas,
    clearRouteFocus,
    cancelRouteDrawing,
    startRouteDrawing,
    routeDrawing,
  } = mapEditor
  const hasChanges =
    isEditing && (form.formState.isDirty || mapEditor.geometryDirty || mapEditor.drawing)

  const errorMessage = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error, t(fallback))
    return parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
  }

  const loadItems = useCallback(async () => {
    const sequence = ++loadSequenceRef.current
    try {
      const loaded = await getConstructionSites(archive)
      if (sequence !== loadSequenceRef.current) {
        return
      }
      const withSelection = await refreshSelectedSite(
        loaded,
        () => selectedIdRef.current,
        async (id) => {
          try {
            return await getConstructionSite(id)
          } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
              return null
            }
            throw error
          }
        },
        () => sequence === loadSequenceRef.current,
      )
      if (sequence !== loadSequenceRef.current) {
        return
      }
      setItems(withSelection)
      setLoadFailed(false)
    } catch {
      if (sequence === loadSequenceRef.current) {
        setLoadFailed(true)
      }
    }
  }, [getConstructionSites, getConstructionSite, archive])
  useEffect(() => {
    if (active) {
      void loadItems()
    }
  }, [active, loadItems])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const update = () => setCompact(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const selectSite = useCallback(
    (site: ConstructionSiteSummary, focusGeometry = true) => {
      alertMapRequestRef.current?.abort()
      setRetainedSiteAlert(null)
      setSelectedId(site.id)
      setRecordMode('inspect')
      form.reset(siteFormValues(site))
      setFeedback(null)
      clearRouteFocus()
      loadAreas(site, focusGeometry)
    },
    [form, loadAreas, clearRouteFocus],
  )

  useEffect(() => {
    if (isEditing) {
      return
    }
    if (selectedSite) {
      loadAreas(selectedSite, false)
    } else if (selectedId && !loadingItems) {
      setSelectedId(null)
      setRecordMode(null)
      clearGeometry()
    }
  }, [isEditing, selectedSite, selectedId, loadingItems, loadAreas, clearGeometry])

  const editSite = () => {
    if (!selectedSite || selectedSite.isDeleted || !canEdit || busy) {
      return
    }
    alertMapRequestRef.current?.abort()
    mapEditor.clearAlertFocus()
    editingVersionRef.current = selectedSite.version
    form.reset(siteFormValues(selectedSite))
    loadAreas(selectedSite, false)
    setRecordMode('edit')
  }

  const discardEdit = useCallback(() => {
    if (selectedSite) {
      form.reset(siteFormValues(selectedSite))
      loadAreas(selectedSite, false)
      setRecordMode('inspect')
    } else {
      form.reset(emptyForm)
      clearGeometry()
      setRecordMode(null)
    }
    setFeedback(null)
  }, [selectedSite, form, loadAreas, clearGeometry])

  const guardAction = useCallback<NavigationGuard>(
    (proceed) => {
      if (busy) {
        return
      }
      if (!hasChanges && !routeDrawing) {
        proceed()
        return
      }
      modal.confirm({
        title: t('workspace.unsavedTitle'),
        content: t('workspace.unsavedMessage'),
        okText: t('workspace.leave'),
        cancelText: t('workspace.stay'),
        onOk: () => {
          discardEdit()
          cancelRouteDrawing()
          proceed()
        },
      })
    },
    [busy, hasChanges, modal, t, discardEdit, routeDrawing, cancelRouteDrawing],
  )

  useEffect(() => {
    if (!active) {
      return
    }
    onRegisterNavigationGuard?.(guardAction)
    return () => onRegisterNavigationGuard?.(null)
  }, [active, guardAction, onRegisterNavigationGuard])
  useEffect(() => {
    if (!hasChanges && !busy && !routeDrawing) {
      return
    }
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [hasChanges, busy, routeDrawing])

  selectFromMapRef.current = (id) => {
    const site = items.find((candidate) => candidate.id === id)
    if (site) {
      guardAction(() => selectSite(site, false))
    }
  }
  const createNewSite = () =>
    guardAction(() => {
      if (!canEdit || !antiforgeryReady) {
        return
      }
      alertMapRequestRef.current?.abort()
      setRetainedSiteAlert(null)
      form.reset(emptyForm)
      clearGeometry()
      setSelectedId(null)
      setFeedback(null)
      setRecordMode('create')
    })

  const deleteSite = async () => {
    if (!selectedSite || selectedSite.isDeleted || !canEdit || !antiforgeryReady || busy) {
      return
    }
    try {
      await deleteConstructionSite(selectedSite.id)
      setDetectionRevision((value) => value + 1)
      const archived = await getConstructionSite(selectedSite.id)
      setItems((current) => [...current.filter((site) => site.id !== archived.id), archived])
      setSelectedIds((current) => current.filter((id) => id !== selectedSite.id))
      selectSite(archived, false)
      notification.success({ message: t('constructionSites.delete.success') })
    } catch (error) {
      notification.error({ message: errorMessage(error, 'constructionSites.delete.failed') })
    }
  }
  const restoreSite = async () => {
    if (!selectedSite?.isDeleted || !canEdit || !antiforgeryReady || busy) {
      return
    }
    try {
      const restored = await restoreConstructionSite(selectedSite.id, selectedSite.version)
      setItems((current) => [...current.filter((site) => site.id !== restored.id), restored])
      setDetectionRevision((value) => value + 1)
      selectSite(restored, false)
      notification.success({ message: t('record.restored') })
    } catch (error) {
      notification.error({ message: errorMessage(error, 'record.restoreFailed') })
    }
  }
  const requestBulkDelete = () => {
    if (!canEdit || !antiforgeryReady || selectedIds.length === 0 || busy) {
      return
    }
    modal.confirm({
      title: t('constructionSites.bulkDelete.confirmTitle'),
      content: (
        <>
          {t('constructionSites.bulkDelete.confirmMessage', { count: selectedIds.length })}
          {hasChanges && selectedId && selectedIds.includes(selectedId) && (
            <p>{t('panes.deleteUnsaved')}</p>
          )}
        </>
      ),
      okText: t('constructionSites.bulkDelete.action'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const deletedIds = new Set(selectedIds)
          const result = await bulkDeleteConstructionSites(selectedIds)
          setItems((current) =>
            current.map((site) => (deletedIds.has(site.id) ? { ...site, isDeleted: true } : site)),
          )
          setDetectionRevision((value) => value + 1)
          setSelectedIds([])
          if (selectedId && deletedIds.has(selectedId)) {
            setSelectedId(null)
            setRecordMode(null)
            form.reset(emptyForm)
            clearGeometry()
          }
          notification.success({
            message: t('constructionSites.bulkDelete.success', { count: result.deletedCount }),
          })
          void loadItems()
        } catch (error) {
          notification.error({
            message: errorMessage(error, 'constructionSites.bulkDelete.failed'),
          })
        }
      },
    })
  }
  const saveSite = async (values: ConstructionSiteFormValues) => {
    if (!canEdit || busy || !isEditing || selectedSite?.isDeleted || mapEditor.drawing) {
      return
    }
    if (!antiforgeryReady) {
      setFeedback({ type: 'info', message: t('constructionSites.sessionLoading') })
      return
    }
    if (recordMode !== 'create' && !selectedSite) {
      return
    }
    setFeedback(null)
    try {
      const request = toWriteRequest(values, mapEditor.getAreaRequests())
      const saved =
        recordMode === 'create'
          ? await createConstructionSite(request)
          : await updateConstructionSite(selectedSite!.id, {
              ...request,
              version: editingVersionRef.current ?? selectedSite!.version,
            })
      setItems((current) => [...current.filter((item) => item.id !== saved.id), saved])
      setDetectionRevision((value) => value + 1)
      selectSite(saved, false)
      notification.success({ message: t('constructionSites.saved') })
    } catch (error) {
      setFeedback({ type: 'error', message: errorMessage(error, 'constructionSites.saveFailed') })
    }
  }
  useEffect(() => {
    const frame = window.requestAnimationFrame(mapEditor.updateSize)
    return () => window.cancelAnimationFrame(frame)
  }, [active, compact, recordMode, mapEditor.updateSize])

  useEffect(() => {
    if (!active) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      if (recordMode === 'create' || recordMode === 'edit') {
        document.querySelector<HTMLInputElement>('.workspace-record-content #title')?.focus()
      } else if (recordMode) {
        document.querySelector<HTMLElement>('.workspace-record-content h2')?.focus()
      } else if (selectedId) {
        document
          .querySelector<HTMLElement>(`tr[data-site-id="${CSS.escape(selectedId)}"]`)
          ?.focus({ preventScroll: true })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active, recordMode, selectedId])

  const showFilterNotice = Boolean(
    recordOpen && selectedId && !filteredItems.some((item) => item.id === selectedId),
  )
  const withoutGeometry = filteredItems.filter((item) => item.areas.length === 0).length
  const openRoute = (id: string, pathId?: string, focusGeometry = true) => {
    guardAction(() => {
      alertMapRequestRef.current?.abort()
      setSelectedRouteId(id)
      setSelectedRoutePathId(pathId ?? null)
      setFocusSelectedRoute(focusGeometry)
      setRouteSelectionToken((value) => value + 1)
    })
  }
  routeSelectionRef.current = (id, pathId) => openRoute(id, pathId, false)
  alertSelectionRef.current = (id) => {
    guardAction(() => {
      alertMapRequestRef.current?.abort()
      const controller = new AbortController()
      alertMapRequestRef.current = controller
      setSelectedAlertId(id)
      setAlertSelectionToken((value) => value + 1)
      void getAlert(id, controller.signal)
        .then((alert) => {
          if (!controller.signal.aborted) {
            focusMapAlert(alert, false)
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            notification.error({ message: errorMessage(error, 'alerts.failed') })
          }
        })
    })
  }
  const openSiteFromAlert = (id: string, alert?: AlertDetails) => {
    guardAction(() => {
      alertMapRequestRef.current?.abort()
      const site = items.find((item) => item.id === id)
      if (site) {
        selectSite(site)
        return
      }
      const controller = new AbortController()
      alertMapRequestRef.current = controller
      void getConstructionSite(id, controller.signal)
        .then((loaded) => {
          if (controller.signal.aborted) {
            return
          }
          setItems((current) => [...current.filter((item) => item.id !== id), loaded])
          selectSite(loaded)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return
          }
          if (axios.isAxiosError(error) && error.response?.status === 404 && alert?.details) {
            clearGeometry()
            setRetainedSiteAlert(alert)
            setSelectedId(null)
            setRecordMode('inspect')
            focusMapAlert(alert)
            return
          }
          notification.error({ message: errorMessage(error, 'workspace.loadFailed') })
        })
    })
  }
  useEffect(() => {
    if (isEditing || !pendingRouteDrawingRef.current) {
      return
    }
    const callback = pendingRouteDrawingRef.current
    pendingRouteDrawingRef.current = null
    startRouteDrawing(callback)
  }, [routeDrawRequest, isEditing, startRouteDrawing])
  const siteActions = canEdit ? (
    <Button
      type="primary"
      icon={<FileAddOutlined />}
      disabled={!antiforgeryReady || busy}
      onClick={createNewSite}
    >
      {t('constructionSites.new')}
    </Button>
  ) : null
  const siteFilters = (
    <div className="construction-site-filter-content">
      <ConstructionSiteFilters
        searchTerm={searchTerm}
        status={status}
        period={period}
        archive={archive}
        includeUndated={includeUndated}
        onIncludeUndatedChange={(value) => {
          setIncludeUndated(value)
          setSelectedIds([])
        }}
        onArchiveChange={(value) => {
          setArchive(value)
          setSelectedIds([])
        }}
        onSearchChange={(value) => {
          setSearchTerm(value)
          setSelectedIds([])
        }}
        onStatusChange={(value) => {
          setStatus(value)
          setSelectedIds([])
        }}
        onPeriodChange={(value) => {
          setPeriod(value)
          setSelectedIds([])
        }}
      />
      <div className="workspace-filter-feedback">
        <div
          className={`workspace-filter-notice${showFilterNotice ? '' : ' is-inactive'}`}
          role="status"
          aria-hidden={!showFilterNotice}
        >
          {t('workspace.filteredSelection')}
        </div>
      </div>
    </div>
  )
  const siteTable =
    !loadingItems && !loadFailed && scopedItems.length === 0 && archive === 'active' ? (
      <Empty
        className="workspace-empty"
        description={
          <>
            <strong>{t('workspace.emptyTitle')}</strong>
            <p>{t('workspace.emptyHint')}</p>
          </>
        }
      />
    ) : (
      <ConstructionSitesTable
        items={filteredItems}
        totalCount={scopedItems.length}
        selectedId={selectedId}
        loading={loadingItems}
        selectedIds={selectedIds}
        canBulkDelete={canEdit && antiforgeryReady}
        bulkDeleting={bulkDeleting}
        onSelect={(site) => guardAction(() => selectSite(site))}
        onSelectionChange={setSelectedIds}
        onBulkDelete={requestBulkDelete}
      />
    )
  const siteDetails = (
    <div className="workspace-record-content">
      {retainedSiteAlert ? (
        <RetainedConstructionSiteDetails alert={retainedSiteAlert} onFocus={mapEditor.focusAlert} />
      ) : recordOpen ? (
        <>
          {recordMode === 'inspect' && selectedSite && (
            <ConstructionSiteDetails
              site={selectedSite}
              canEdit={canEdit && antiforgeryReady}
              onEdit={editSite}
              deleting={deleting}
              onDelete={deleteSite}
              onRestore={restoreSite}
              restoring={restoring}
              selectedAreaKey={mapEditor.selectedAreaKey}
              onSelectArea={(key) => {
                alertMapRequestRef.current?.abort()
                mapEditor.selectArea(key)
              }}
            />
          )}
          {isEditing && (
            <ConstructionSiteEditor
              form={form}
              selectedSite={selectedSite}
              isNew={recordMode === 'create'}
              areas={mapEditor.editorAreas}
              selectedAreaKey={mapEditor.selectedAreaKey}
              canEdit={canEdit && antiforgeryReady}
              drawing={mapEditor.drawing}
              editingGeometry={mapEditor.editingGeometry}
              geometryDirty={mapEditor.geometryDirty}
              feedback={feedback}
              saving={creating || updating}
              deleting={deleting}
              onSubmit={(values) => {
                void saveSite(values)
              }}
              onToggleDrawing={() => {
                alertMapRequestRef.current?.abort()
                mapEditor.setDrawing(!mapEditor.drawing)
              }}
              onSelectArea={(key) => {
                alertMapRequestRef.current?.abort()
                mapEditor.selectArea(key)
              }}
              onDeleteArea={mapEditor.deleteArea}
              onDiscard={discardEdit}
              onDelete={deleteSite}
            />
          )}
        </>
      ) : (
        <div className="workspace-record-empty">
          <SelectOutlined aria-hidden />
          <strong>{t('panes.selectTitle')}</strong>
          <span>{t('panes.selectHint')}</span>
        </div>
      )}
    </div>
  )
  return (
    <main className={`workspace workspace-redesigned${recordOpen ? ' record-open' : ''}`}>
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          title={t('workspace.loadFailed')}
          action={
            <Button size="small" onClick={() => void loadItems()}>
              {t('workspace.retry')}
            </Button>
          }
        />
      )}
      {routesFailed && (
        <Alert
          type="warning"
          showIcon
          title={t('routes.failed')}
          action={
            <Button size="small" onClick={reloadRoutes}>
              {t('workspace.retry')}
            </Button>
          }
        />
      )}
      <DockingWorkspace
        compact={compact}
        defaultLayout={defaultDockLayout}
        storageKey="constructionSites.docking.v1"
        transformSavedLayout={mergeConstructionSitePanels}
        onLayoutChange={mapEditor.updateSize}
        panels={[
          {
            id: 'sites',
            title: t('nav.constructionSites'),
            icon: <TableOutlined />,
            minWidth: 420,
            minHeight: 320,
            content: (
              <ConstructionSitesWidget
                filters={siteFilters}
                table={siteTable}
                details={siteDetails}
                actions={siteActions}
                hasSelection={recordOpen}
                onBackToList={() =>
                  guardAction(() => {
                    alertMapRequestRef.current?.abort()
                    setSelectedId(null)
                    setRecordMode(null)
                    setRetainedSiteAlert(null)
                    clearGeometry()
                  })
                }
              />
            ),
          },
          {
            id: 'map',
            title: t('workspace.map'),
            icon: <EnvironmentOutlined />,
            minWidth: 320,
            minHeight: 180,
            content: (
              <div className="workspace-map-content">
                <ConstructionSiteMap
                  mapElementRef={mapEditor.mapElementRef}
                  layerVisibility={mapEditor.layerVisibility}
                  onLayerVisibilityChange={(id, visible) => {
                    if (id === 'alerts' && !visible) {
                      alertMapRequestRef.current?.abort()
                      timeline.exit()
                    }
                    mapEditor.changeLayerVisibility(id, visible)
                  }}
                  alertTimeline={
                    <AlertTimelineControl
                      enabled={timeline.enabled}
                      playing={timeline.playing}
                      date={timeline.date}
                      settings={timeline.settings}
                      index={timeline.index}
                      maxIndex={timeline.maxIndex}
                      count={visibleMapAlerts.filter((alert) => alert.location).length}
                      onEnter={timeline.enter}
                      onExit={timeline.exit}
                      onTogglePlaying={timeline.togglePlaying}
                      onPause={timeline.pause}
                      onSeek={timeline.seek}
                      onConfigure={timeline.configure}
                    />
                  }
                  drawing={mapEditor.drawing}
                  editingGeometry={mapEditor.editingGeometry}
                  canEditGeometry={
                    canEdit && isEditing && antiforgeryReady && mapEditor.editorAreas.length > 0
                  }
                  onStartEditing={() => {
                    alertMapRequestRef.current?.abort()
                    mapEditor.setEditingGeometry(true)
                  }}
                  onSelectAddress={mapEditor.focusAddress}
                  onCancelDrawing={() => mapEditor.setDrawing(false)}
                  onFinishDrawing={mapEditor.finishDrawing}
                  canFinishDrawing={mapEditor.canFinishDrawing}
                  onFinishEditing={() => {
                    mapEditor.setEditingGeometry(false)
                  }}
                  routeDrawing={mapEditor.routeDrawing}
                  canFinishRouteDrawing={mapEditor.canFinishRouteDrawing}
                  onFinishRouteDrawing={mapEditor.finishRouteDrawing}
                  onCancelRouteDrawing={mapEditor.cancelRouteDrawing}
                />
                {alertsFailed && mapEditor.layerVisibility.alerts && (
                  <div className="workspace-map-note" role="status">
                    {t('map.layers.alertsFailed')}{' '}
                    <Button type="link" size="small" onClick={reloadAlerts}>
                      {t('alerts.refresh')}
                    </Button>
                  </div>
                )}
                {!recordOpen && withoutGeometry > 0 && (
                  <div className="workspace-map-note">
                    {t('workspace.noGeometry', { count: withoutGeometry })}
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'routes',
            title: t('routes.title'),
            icon: <BranchesOutlined />,
            minWidth: 340,
            minHeight: 260,
            defaultCollapsed: true,
            content: (
              <RoutesWidget
                canEdit={canEdit}
                antiforgeryReady={antiforgeryReady}
                selectedRouteId={selectedRouteId}
                selectedPathId={selectedRoutePathId}
                selectionToken={routeSelectionToken}
                focusSelectedRoute={focusSelectedRoute}
                routeDrawing={mapEditor.routeDrawing}
                onCancelRouteDrawing={mapEditor.cancelRouteDrawing}
                onFocusRoute={(route, focusGeometry = true) =>
                  guardAction(() => {
                    alertMapRequestRef.current?.abort()
                    mapEditor.focusRoute(route, focusGeometry)
                  })
                }
                onDrawRoute={(callback) =>
                  guardAction(() => {
                    alertMapRequestRef.current?.abort()
                    if (isEditing) {
                      discardEdit()
                    }
                    pendingRouteDrawingRef.current = callback
                    setRouteDrawRequest((value) => value + 1)
                  })
                }
                onChanged={() => {
                  setRouteRevision((value) => value + 1)
                  setDetectionRevision((value) => value + 1)
                }}
              />
            ),
          },
          {
            id: 'alerts',
            title: t('alerts.title'),
            icon: <BellOutlined />,
            minWidth: 420,
            minHeight: 280,
            defaultCollapsed: true,
            content: (
              <AlertsWidget
                filters={alertFilters}
                onFiltersChange={changeAlertFilters}
                canEdit={canEdit}
                canAdmin={canAdmin}
                antiforgeryReady={antiforgeryReady}
                refreshToken={detectionRevision}
                detectionStatus={detection.status}
                detectionStatusUnavailable={detection.unavailable}
                onRefreshDetectionStatus={detection.reload}
                onScanStarted={detection.scanStarted}
                selectedAlertId={selectedAlertId}
                selectionToken={alertSelectionToken}
                onChanged={() => setDetectionRevision((value) => value + 1)}
                onFocusAlert={(alert, origin) =>
                  guardAction(() => {
                    alertMapRequestRef.current?.abort()
                    focusMapAlert(alert, true, origin)
                  })
                }
                onOpenConstructionSite={openSiteFromAlert}
                onOpenRoute={openRoute}
              />
            ),
          },
        ]}
      />
    </main>
  )
}
