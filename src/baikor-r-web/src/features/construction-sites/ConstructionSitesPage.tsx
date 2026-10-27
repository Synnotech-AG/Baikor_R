import { FileAddOutlined, FileTextOutlined, SelectOutlined, TableOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { yupResolver } from '@hookform/resolvers/yup'
import { Alert, App as AntApp, Button, Checkbox, Empty } from 'antd'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useCreateConstructionSiteEndpoint } from '../../api/endpoints/useCreateConstructionSiteEndpoint'
import { useBulkDeleteConstructionSitesEndpoint } from '../../api/endpoints/useBulkDeleteConstructionSitesEndpoint'
import { useDeleteConstructionSiteEndpoint } from '../../api/endpoints/useDeleteConstructionSiteEndpoint'
import { useGetConstructionSitesEndpoint } from '../../api/endpoints/useGetConstructionSitesEndpoint'
import { useUpdateConstructionSiteEndpoint } from '../../api/endpoints/useUpdateConstructionSiteEndpoint'
import { parseApiError } from '../../api/errors'
import { DockingWorkspace } from '../../shared/docking/DockingWorkspace'
import type { DockingWorkspaceHandle } from '../../shared/docking/DockingWorkspace'
import type { DockNode } from '../../shared/docking/layout'
import { ConstructionSiteDetails } from './components/ConstructionSiteDetails'
import { ConstructionSiteEditor } from './components/ConstructionSiteEditor'
import { ConstructionSiteFilters } from './components/ConstructionSiteFilters'
import { ConstructionSiteMap } from './components/ConstructionSiteMap'
import { ConstructionSitesTable } from './components/ConstructionSitesTable'
import { editorRoles } from './constants'
import { useConstructionSiteMap } from './hooks/useConstructionSiteMap'
import type { ConstructionSiteFormValues, ConstructionSiteStatus, ConstructionSiteSummary, UserSession } from './types'
import { createConstructionSiteSchema } from './validation'
import { filterConstructionSites, toWriteRequest } from './workspace'
import type { NavigationGuard } from './workspace'
import './workspace.css'

interface ConstructionSitesPageProps {
  session: UserSession | null
  antiforgeryReady: boolean
  active?: boolean
  onRegisterNavigationGuard?: (guard: NavigationGuard | null) => void
}

const emptyForm: ConstructionSiteFormValues = {
  title: '', status: 'draft', plannedStart: '', plannedEnd: '', diversion: '', contacts: [], communications: [], metadata: [],
}

const defaultDockLayout: DockNode = {
  kind: 'split', id: 'overview-main', axis: 'vertical', ratio: 0.58,
  first: {
    kind: 'split', id: 'overview-top', axis: 'horizontal', ratio: 0.6,
    first: { kind: 'panel', id: 'sites' }, second: { kind: 'panel', id: 'details' },
  },
  second: { kind: 'panel', id: 'map' },
}

function siteFormValues(site: ConstructionSiteSummary): ConstructionSiteFormValues {
  return {
    title: site.title, status: site.status, plannedStart: site.plannedStart ?? '', plannedEnd: site.plannedEnd ?? '',
    diversion: site.diversion ?? '',
    contacts: site.contacts.map((item) => ({ ...item, email: item.email ?? '', phone1: item.phone1 ?? '', phone2: item.phone2 ?? '' })),
    communications: site.communications.map((item) => ({ ...item, note: item.note ?? '' })),
    metadata: Object.entries(site.metadata ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value })),
  }
}

export function ConstructionSitesPage({ session, antiforgeryReady, active = true, onRegisterNavigationGuard }: ConstructionSitesPageProps) {
  const { t, i18n } = useTranslation()
  const { modal, notification } = AntApp.useApp()
  const locale = i18n.resolvedLanguage?.startsWith('de') ? 'de-DE' : 'en-US'
  const schema = useMemo(() => createConstructionSiteSchema(t), [t])
  const form = useForm<ConstructionSiteFormValues>({ resolver: yupResolver(schema), defaultValues: emptyForm, mode: 'onTouched', shouldFocusError: false })
  const [items, setItems] = useState<ConstructionSiteSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [recordMode, setRecordMode] = useState<'inspect' | 'edit' | 'create' | null>(null)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [searchTerm, setSearchTerm] = useState('')
  const [status, setStatus] = useState<ConstructionSiteStatus | 'all'>('all')
  const [period, setPeriod] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [includeUndated, setIncludeUndated] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; message: string } | null>(null)
  const selectFromMapRef = useRef<(id: string) => void>(() => undefined)
  const dockingRef = useRef<DockingWorkspaceHandle>(null)
  const editingVersionRef = useRef<number | null>(null)
  const { execute: getConstructionSites, isLoading: loadingItems } = useGetConstructionSitesEndpoint()
  const { execute: createConstructionSite, isLoading: creating } = useCreateConstructionSiteEndpoint()
  const { execute: deleteConstructionSite, isLoading: deleting } = useDeleteConstructionSiteEndpoint()
  const { execute: bulkDeleteConstructionSites, isLoading: bulkDeleting } = useBulkDeleteConstructionSitesEndpoint()
  const { execute: updateConstructionSite, isLoading: updating } = useUpdateConstructionSiteEndpoint()
  const canEdit = session?.roles.some((role) => editorRoles.includes(role)) ?? false
  const selectedSite = items.find((item) => item.id === selectedId) ?? null
  const recordOpen = recordMode !== null
  const isEditing = recordMode === 'edit' || recordMode === 'create'
  const busy = creating || updating || deleting || bulkDeleting
  const filteredItems = useMemo(() => filterConstructionSites(items, {
    search: searchTerm, status, periodStart: period?.[0]?.format('YYYY-MM-DD') ?? null,
    periodEnd: period?.[1]?.format('YYYY-MM-DD') ?? null, includeUndated,
  }, locale), [items, searchTerm, status, period, includeUndated, locale])
  const mapEditor = useConstructionSiteMap({
    canEdit: canEdit && isEditing, constructionSites: filteredItems, selectedId,
    showSelectedGeometry: recordOpen || filteredItems.some((site) => site.id === selectedId),
    onSelectConstructionSite: (id) => selectFromMapRef.current(id),
  })
  const { clearGeometry, loadAreas } = mapEditor
  const hasChanges = isEditing && (form.formState.isDirty || mapEditor.geometryDirty || mapEditor.drawing)

  const errorMessage = (error: unknown, fallback: string) => {
    const parsed = parseApiError(error, t(fallback))
    return parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
  }

  const loadItems = useCallback(async () => {
    try { setItems(await getConstructionSites()); setLoadFailed(false) }
    catch { setLoadFailed(true) }
  }, [getConstructionSites])
  useEffect(() => { if (active) void loadItems() }, [active, loadItems])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const update = () => setCompact(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const selectSite = useCallback((site: ConstructionSiteSummary, focusGeometry = true) => {
    setSelectedId(site.id); setRecordMode('inspect'); dockingRef.current?.showPanel('details')
    form.reset(siteFormValues(site)); setFeedback(null); loadAreas(site, focusGeometry)
  }, [form, loadAreas])

  useEffect(() => {
    if (isEditing) return
    if (selectedSite) loadAreas(selectedSite, false)
    else if (selectedId && !loadingItems) { setSelectedId(null); setRecordMode(null); clearGeometry() }
  }, [isEditing, selectedSite, selectedId, loadingItems, loadAreas, clearGeometry])

  const editSite = () => {
    if (!selectedSite || !canEdit || busy) return
    editingVersionRef.current = selectedSite.version
    form.reset(siteFormValues(selectedSite))
    loadAreas(selectedSite, false)
    setRecordMode('edit'); dockingRef.current?.showPanel('details')
  }

  const discardEdit = useCallback(() => {
    if (selectedSite) { form.reset(siteFormValues(selectedSite)); loadAreas(selectedSite, false); setRecordMode('inspect') }
    else { form.reset(emptyForm); clearGeometry(); setRecordMode(null) }
    setFeedback(null); dockingRef.current?.showPanel(selectedSite ? 'details' : 'sites')
  }, [selectedSite, form, loadAreas, clearGeometry])

  const guardAction = useCallback<NavigationGuard>((proceed) => {
    if (busy) return
    if (!hasChanges) { proceed(); return }
    modal.confirm({
      title: t('workspace.unsavedTitle'), content: t('workspace.unsavedMessage'),
      okText: t('workspace.leave'), cancelText: t('workspace.stay'),
      onOk: () => { discardEdit(); proceed() },
    })
  }, [busy, hasChanges, modal, t, discardEdit])

  useEffect(() => {
    if (!active) return
    onRegisterNavigationGuard?.(guardAction)
    return () => onRegisterNavigationGuard?.(null)
  }, [active, guardAction, onRegisterNavigationGuard])
  useEffect(() => {
    if (!hasChanges && !busy) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [hasChanges, busy])

  selectFromMapRef.current = (id) => {
    const site = items.find((candidate) => candidate.id === id)
    if (site) guardAction(() => selectSite(site, false))
  }
  const createNewSite = () => guardAction(() => {
    if (!canEdit || !antiforgeryReady) return
    form.reset(emptyForm); clearGeometry(); setSelectedId(null); setFeedback(null); setRecordMode('create'); dockingRef.current?.showPanel('details')
  })

  const deleteSite = async () => {
    if (!selectedSite || !canEdit || !antiforgeryReady || busy) return
    try {
      await deleteConstructionSite(selectedSite.id)
      setItems((current) => current.filter((site) => site.id !== selectedSite.id))
      setSelectedIds((current) => current.filter((id) => id !== selectedSite.id))
      setSelectedId(null); setRecordMode(null); form.reset(emptyForm); clearGeometry()
      dockingRef.current?.showPanel('sites')
      notification.success({ message: t('constructionSites.delete.success') })
    } catch (error) { notification.error({ message: errorMessage(error, 'constructionSites.delete.failed') }) }
  }
  const requestBulkDelete = () => {
    if (!canEdit || !antiforgeryReady || selectedIds.length === 0 || busy) return
    modal.confirm({
      title: t('constructionSites.bulkDelete.confirmTitle'),
      content: <>{t('constructionSites.bulkDelete.confirmMessage', { count: selectedIds.length })}
        {hasChanges && selectedId && selectedIds.includes(selectedId) && <p>{t('panes.deleteUnsaved')}</p>}</>,
      okText: t('constructionSites.bulkDelete.action'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const deletedIds = new Set(selectedIds)
          const result = await bulkDeleteConstructionSites(selectedIds)
          setItems((current) => current.filter((site) => !deletedIds.has(site.id))); setSelectedIds([])
          if (selectedId && deletedIds.has(selectedId)) {
            setSelectedId(null); setRecordMode(null); form.reset(emptyForm); clearGeometry(); dockingRef.current?.showPanel('sites')
          }
          notification.success({ message: t('constructionSites.bulkDelete.success', { count: result.deletedCount }) })
        } catch (error) { notification.error({ message: errorMessage(error, 'constructionSites.bulkDelete.failed') }) }
      },
    })
  }
  const saveSite = async (values: ConstructionSiteFormValues) => {
    if (!canEdit || busy || !isEditing || mapEditor.drawing) return
    if (!antiforgeryReady) { setFeedback({ type: 'info', message: t('constructionSites.sessionLoading') }); return }
    if (recordMode !== 'create' && !selectedSite) return
    setFeedback(null)
    try {
      const request = toWriteRequest(values, mapEditor.getAreaRequests())
      const saved = recordMode === 'create' ? await createConstructionSite(request)
        : await updateConstructionSite(selectedSite!.id, { ...request, version: editingVersionRef.current ?? selectedSite!.version })
      setItems((current) => [...current.filter((item) => item.id !== saved.id), saved]); selectSite(saved, false)
      notification.success({ message: t('constructionSites.saved') })
    } catch (error) { setFeedback({ type: 'error', message: errorMessage(error, 'constructionSites.saveFailed') }) }
  }
  useEffect(() => {
    const frame = window.requestAnimationFrame(mapEditor.updateSize)
    return () => window.cancelAnimationFrame(frame)
  }, [active, compact, recordMode, mapEditor.updateSize])

  useEffect(() => {
    if (!active) return
    const frame = window.requestAnimationFrame(() => {
      if (recordMode === 'create' || recordMode === 'edit') document.querySelector<HTMLInputElement>('.workspace-record-content #title')?.focus()
      else if (recordMode) document.querySelector<HTMLElement>('.workspace-record-content h2')?.focus()
      else if (selectedId) document.querySelector<HTMLElement>(`tr[data-site-id="${CSS.escape(selectedId)}"]`)?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active, recordMode, selectedId])

  const resetFilters = () => { setSearchTerm(''); setStatus('all'); setPeriod(null); setIncludeUndated(false); setSelectedIds([]) }
  const hasFilters = Boolean(searchTerm || status !== 'all' || period)
  const showFilterNotice = Boolean(recordOpen && selectedId && !filteredItems.some((item) => item.id === selectedId))
  const withoutGeometry = filteredItems.filter((item) => item.areas.length === 0).length
  const revealMap = () => dockingRef.current?.showPanel('map')
  const selectArea = (key: string) => { mapEditor.selectArea(key); revealMap() }
  return (
    <main className={`workspace workspace-redesigned${recordOpen ? ' record-open' : ''}`}>
      <div className="workspace-heading workspace-toolbar-heading">
        <div><h2>{t('workspace.heading')}</h2></div>
        <div className="workspace-heading-actions">
          {canEdit && <Button type="primary" icon={<FileAddOutlined />} disabled={!antiforgeryReady || busy} onClick={createNewSite}>{t('constructionSites.new')}</Button>}
        </div>
      </div>
      <div className="workspace-filterbar workspace-toolbar-filters">
        <ConstructionSiteFilters searchTerm={searchTerm} status={status} period={period}
          onSearchChange={(value) => { setSearchTerm(value); setSelectedIds([]) }}
          onStatusChange={(value) => { setStatus(value); setSelectedIds([]) }}
          onPeriodChange={(value) => { setPeriod(value); setSelectedIds([]) }} />
        <div className="workspace-filter-feedback">
          <div className={`workspace-filter-summary${hasFilters ? '' : ' is-inactive'}`} aria-hidden={!hasFilters}>
            <Button type="link" size="small" disabled={!hasFilters} tabIndex={hasFilters ? 0 : -1} onClick={resetFilters}>{t('workspace.reset')}</Button>
          </div>
          <div className={`workspace-filter-notice${showFilterNotice ? '' : ' is-inactive'}`} role="status" aria-hidden={!showFilterNotice}>
            {t('workspace.filteredSelection')}
          </div>
          <div className={`workspace-period-options${period ? '' : ' is-inactive'}`} aria-hidden={!period}>
            <Checkbox checked={includeUndated} disabled={!period} tabIndex={period ? 0 : -1}
              onChange={(event) => { setIncludeUndated(event.target.checked); setSelectedIds([]) }}>{t('workspace.includeUndated')}</Checkbox>
          </div>
        </div>
      </div>
      {loadFailed && <Alert type="error" showIcon title={t('workspace.loadFailed')} action={<Button size="small" onClick={() => void loadItems()}>{t('workspace.retry')}</Button>} />}
      <DockingWorkspace ref={dockingRef} compact={compact} defaultLayout={defaultDockLayout}
        storageKey="constructionSites.docking.v1" onLayoutChange={mapEditor.updateSize} panels={[
          { id: 'sites', title: t('nav.constructionSites'), icon: <TableOutlined />, minWidth: 380, minHeight: 240,
            content: !loadingItems && !loadFailed && items.length === 0
              ? <Empty className="workspace-empty" description={<><strong>{t('workspace.emptyTitle')}</strong><p>{t('workspace.emptyHint')}</p></>} />
              : <ConstructionSitesTable items={filteredItems} totalCount={items.length} selectedId={selectedId} loading={loadingItems} selectedIds={selectedIds}
                canBulkDelete={canEdit && antiforgeryReady} bulkDeleting={bulkDeleting} onSelect={(site) => guardAction(() => selectSite(site))}
                onSelectionChange={setSelectedIds} onBulkDelete={requestBulkDelete} /> },
          { id: 'details', title: t('workspace.details'), icon: <FileTextOutlined />, minWidth: 320, minHeight: 240,
            content: <div className="workspace-record-content">{recordOpen ? <>
              {recordMode === 'inspect' && selectedSite && <ConstructionSiteDetails site={selectedSite} canEdit={canEdit && antiforgeryReady}
                onEdit={editSite} deleting={deleting} onDelete={deleteSite}
                selectedAreaKey={mapEditor.selectedAreaKey} onSelectArea={selectArea} />}
              {isEditing && <ConstructionSiteEditor form={form} selectedSite={selectedSite} isNew={recordMode === 'create'}
                areas={mapEditor.editorAreas} selectedAreaKey={mapEditor.selectedAreaKey} canEdit={canEdit && antiforgeryReady}
                drawing={mapEditor.drawing} editingGeometry={mapEditor.editingGeometry} geometryDirty={mapEditor.geometryDirty}
                feedback={feedback} saving={creating || updating} deleting={deleting} onSubmit={(values) => { void saveSite(values) }}
                onToggleDrawing={() => { mapEditor.setDrawing(!mapEditor.drawing); revealMap() }}
                onSelectArea={selectArea} onDeleteArea={(key) => { mapEditor.deleteArea(key); revealMap() }}
                onDiscard={discardEdit} onDelete={deleteSite} />}
            </> : <div className="workspace-record-empty">
              <SelectOutlined aria-hidden /><strong>{t('panes.selectTitle')}</strong><span>{t('panes.selectHint')}</span>
            </div>}</div> },
          { id: 'map', title: t('workspace.map'), icon: <EnvironmentOutlined />, minWidth: 320, minHeight: 180,
            content: <div className="workspace-map-content">
              <ConstructionSiteMap mapElementRef={mapEditor.mapElementRef} drawing={mapEditor.drawing} editingGeometry={mapEditor.editingGeometry}
                canEditGeometry={canEdit && isEditing && antiforgeryReady && mapEditor.editorAreas.length > 0}
                onStartEditing={() => { mapEditor.setEditingGeometry(true); revealMap() }}
                onSelectAddress={mapEditor.focusAddress}
                onCancelDrawing={() => mapEditor.setDrawing(false)} onFinishDrawing={mapEditor.finishDrawing}
                canFinishDrawing={mapEditor.canFinishDrawing}
                onFinishEditing={() => { mapEditor.setEditingGeometry(false); dockingRef.current?.showPanel('details') }}
                onFitResults={!recordOpen && filteredItems.some((site) => site.areas.length > 0) ? mapEditor.fitResults : undefined} />
              {!recordOpen && withoutGeometry > 0 && <div className="workspace-map-note">{t('workspace.noGeometry', { count: withoutGeometry })}</div>}
            </div> },
        ]} />
    </main>
  )
}
