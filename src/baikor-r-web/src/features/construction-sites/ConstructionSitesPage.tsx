import { yupResolver } from '@hookform/resolvers/yup'
import { App as AntApp } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useCreateConstructionSiteEndpoint } from '../../api/endpoints/useCreateConstructionSiteEndpoint'
import { useBulkDeleteConstructionSitesEndpoint } from '../../api/endpoints/useBulkDeleteConstructionSitesEndpoint'
import { useDeleteConstructionSiteEndpoint } from '../../api/endpoints/useDeleteConstructionSiteEndpoint'
import { useGetConstructionSitesEndpoint } from '../../api/endpoints/useGetConstructionSitesEndpoint'
import { useUpdateConstructionSiteEndpoint } from '../../api/endpoints/useUpdateConstructionSiteEndpoint'
import { parseApiError } from '../../api/errors'
import { ConstructionSiteEditor } from './components/ConstructionSiteEditor'
import { ConstructionSiteMap } from './components/ConstructionSiteMap'
import { ConstructionSitesTable } from './components/ConstructionSitesTable'
import { ResizableContent } from './components/ResizableContent'
import { editorRoles } from './constants'
import { useConstructionSiteMap } from './hooks/useConstructionSiteMap'
import type { ConstructionSiteFormValues, ConstructionSiteSummary, UserSession } from './types'
import { createConstructionSiteSchema } from './validation'

interface ConstructionSitesPageProps {
  session: UserSession | null
  antiforgeryReady: boolean
}

const emptyForm: ConstructionSiteFormValues = {
  title: '', status: 'draft', plannedStart: '', plannedEnd: '', diversion: '', contacts: [], communications: [], metadata: [],
}

export function ConstructionSitesPage({ session, antiforgeryReady }: ConstructionSitesPageProps) {
  const { t, i18n } = useTranslation()
  const { modal, notification } = AntApp.useApp()
  const schema = useMemo(() => createConstructionSiteSchema(t), [t])
  const form = useForm<ConstructionSiteFormValues>({
    resolver: yupResolver(schema),
    defaultValues: emptyForm,
    mode: 'onTouched',
    shouldFocusError: false,
  })
  const [items, setItems] = useState<ConstructionSiteSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; message: string } | null>(null)
  const selectFromMapRef = useRef<(id: string) => void>(() => undefined)
  const { execute: getConstructionSites, isLoading: loadingItems } = useGetConstructionSitesEndpoint()
  const { execute: createConstructionSite, isLoading: creating } = useCreateConstructionSiteEndpoint()
  const { execute: deleteConstructionSite, isLoading: deleting } = useDeleteConstructionSiteEndpoint()
  const { execute: bulkDeleteConstructionSites, isLoading: bulkDeleting } = useBulkDeleteConstructionSitesEndpoint()
  const { execute: updateConstructionSite, isLoading: updating } = useUpdateConstructionSiteEndpoint()
  const canEdit = session?.roles.some((role) => editorRoles.includes(role)) ?? false
  const selectedSite = items.find((item) => item.id === selectedId) ?? null
  const editorVisible = selectedSite !== null

  const mapEditor = useConstructionSiteMap({
    canEdit,
    constructionSites: items,
    selectedId,
    onSelectConstructionSite: (id) => selectFromMapRef.current(id),
  })
  const { clearGeometry, loadAreas } = mapEditor

  const loadItems = useCallback(async () => {
    try {
      const loadedItems = await getConstructionSites()
      setItems(loadedItems)
      return loadedItems
    } catch {
      setItems([])
      return []
    }
  }, [getConstructionSites])

  useEffect(() => { void loadItems() }, [loadItems])

  const selectSite = useCallback((site: ConstructionSiteSummary, focusGeometry = true) => {
    setSelectedId(site.id)
    form.reset({
      title: site.title,
      status: site.status,
      plannedStart: site.plannedStart ?? '',
      plannedEnd: site.plannedEnd ?? '',
      diversion: site.diversion ?? '',
      contacts: site.contacts.map((contact) => ({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        role: contact.role,
        email: contact.email ?? '',
        phone1: contact.phone1 ?? '',
        phone2: contact.phone2 ?? '',
      })),
      communications: site.communications.map((communication) => ({
        id: communication.id,
        type: communication.type,
        note: communication.note ?? '',
      })),
      metadata: Object.entries(site.metadata ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({ key, value })),
    })
    setFeedback(null)
    loadAreas(site, focusGeometry)
  }, [form, loadAreas])

  selectFromMapRef.current = (id) => {
    const site = items.find((candidate) => candidate.id === id)
    if (site) selectSite(site, false)
  }

  const createNewSite = async () => {
    if (!canEdit) return
    if (!antiforgeryReady) {
      notification.info({ message: t('constructionSites.sessionLoading') })
      return
    }

    try {
      const created = await createConstructionSite({
        title: t('constructionSites.defaultTitle'),
        status: 'draft',
        plannedStart: null,
        plannedEnd: null,
        diversion: null,
        contacts: [],
        communications: [],
        metadata: {},
        areas: [],
      })
      setItems((current) => [...current, created])
      selectSite(created, false)
    } catch (error) {
      const parsed = parseApiError(error, t('constructionSites.saveFailed'))
      const message = parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
      notification.error({ message })
    }
  }

  const closeSite = useCallback(() => {
    setSelectedId(null)
    setFeedback(null)
    form.reset(emptyForm)
    clearGeometry()
  }, [clearGeometry, form])

  const requestCloseSite = () => {
    if (!form.formState.isDirty && !mapEditor.geometryDirty) {
      closeSite()
      return
    }

    modal.confirm({
      title: t('constructionSites.close.confirmTitle'),
      content: t('constructionSites.close.confirmMessage'),
      okText: t('constructionSites.close.confirm'),
      cancelText: t('common.cancel'),
      onOk: closeSite,
    })
  }

  const requestDeleteSite = () => {
    if (!selectedSite || !canEdit) return
    if (!antiforgeryReady) {
      notification.info({ message: t('constructionSites.sessionLoading') })
      return
    }

    modal.confirm({
      title: t('constructionSites.delete.confirmTitle'),
      content: t('constructionSites.delete.confirmMessage', { title: selectedSite.title }),
      okText: t('constructionSites.delete.action'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteConstructionSite(selectedSite.id)
          setItems((current) => current.filter((site) => site.id !== selectedSite.id))
          setSelectedIds((current) => current.filter((id) => id !== selectedSite.id))
          closeSite()
          notification.success({ message: t('constructionSites.delete.success') })
        } catch (error) {
          const parsed = parseApiError(error, t('constructionSites.delete.failed'))
          const message = parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
          notification.error({ message })
        }
      },
    })
  }

  const requestBulkDelete = () => {
    if (!canEdit || selectedIds.length === 0) return
    if (!antiforgeryReady) {
      notification.info({ message: t('constructionSites.sessionLoading') })
      return
    }

    modal.confirm({
      title: t('constructionSites.bulkDelete.confirmTitle'),
      content: t('constructionSites.bulkDelete.confirmMessage', { count: selectedIds.length }),
      okText: t('constructionSites.bulkDelete.action'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const deletedIds = new Set(selectedIds)
          const result = await bulkDeleteConstructionSites(selectedIds)
          setItems((current) => current.filter((site) => !deletedIds.has(site.id)))
          setSelectedIds([])
          if (selectedId && deletedIds.has(selectedId)) closeSite()
          notification.success({
            message: t('constructionSites.bulkDelete.success', { count: result.deletedCount }),
          })
        } catch (error) {
          const parsed = parseApiError(error, t('constructionSites.bulkDelete.failed'))
          const message = parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
          notification.error({ message })
        }
      },
    })
  }

  const saveSite = async (values: ConstructionSiteFormValues) => {
    if (!selectedSite || !antiforgeryReady) {
      setFeedback({ type: 'info', message: t('constructionSites.sessionLoading') })
      return
    }

    setFeedback(null)
    const request = {
      title: values.title.trim(),
      status: values.status,
      plannedStart: values.plannedStart || null,
      plannedEnd: values.plannedEnd || null,
      areas: mapEditor.getAreaRequests(),
      diversion: values.diversion.trim() || null,
      contacts: values.contacts.map((contact) => ({
        ...contact,
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim(),
        role: contact.role.trim(),
        email: contact.email.trim() || null,
        phone1: contact.phone1.trim() || null,
        phone2: contact.phone2.trim() || null,
      })),
      communications: values.communications.map((communication) => ({
        ...communication,
        type: communication.type.trim(),
        note: communication.note.trim() || null,
      })),
      metadata: Object.fromEntries(values.metadata.map(({ key, value }) => [key.trim(), value.trim()])),
    }

    try {
      const saved = await updateConstructionSite(selectedSite.id, { ...request, version: selectedSite.version })
      const refreshedItems = await loadItems()
      const refreshedSite = refreshedItems.find((item) => item.id === saved.id) ?? saved
      if (!refreshedItems.some((item) => item.id === saved.id)) {
        setItems([...refreshedItems, refreshedSite])
      }
      selectSite(refreshedSite, false)
      notification.success({ message: t('constructionSites.saved') })
    } catch (error) {
      const parsed = parseApiError(error, t('constructionSites.saveFailed'))
      const message = parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
      setFeedback({ type: 'error', message })
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(mapEditor.updateSize)
    return () => window.cancelAnimationFrame(frame)
  }, [editorVisible, mapEditor.updateSize])

  return (
    <main className={`workspace${editorVisible ? ' has-editor' : ''}${mapEditor.drawing ? ' is-drawing' : ''}`}>
      {selectedSite && <ConstructionSiteEditor
        form={form}
        selectedSite={selectedSite}
        areas={mapEditor.editorAreas}
        selectedAreaKey={mapEditor.selectedAreaKey}
        canEdit={canEdit}
        drawing={mapEditor.drawing}
        geometryDirty={mapEditor.geometryDirty}
        feedback={feedback}
        saving={updating}
        deleting={deleting}
        onSubmit={(values) => { void saveSite(values) }}
        onToggleDrawing={() => mapEditor.setDrawing((active) => !active)}
        onSelectArea={mapEditor.selectArea}
        onDeleteArea={mapEditor.deleteArea}
        onDiscard={() => selectSite(selectedSite, false)}
        onClose={requestCloseSite}
        onDelete={requestDeleteSite}
      />}
      <ResizableContent
        map={<ConstructionSiteMap
          mapElementRef={mapEditor.mapElementRef}
          drawing={mapEditor.drawing}
          creating={creating}
          canCreate={canEdit && antiforgeryReady}
          onSelectAddress={mapEditor.focusAddress}
          onCreate={() => { void createNewSite() }}
          onCancelDrawing={() => mapEditor.setDrawing(false)}
        />}
        onResize={mapEditor.updateSize}
      >
        <ConstructionSitesTable
          items={items}
          selectedId={selectedId}
          loading={loadingItems}
          selectedIds={selectedIds}
          canBulkDelete={canEdit && antiforgeryReady}
          bulkDeleting={bulkDeleting}
          onSelect={selectSite}
          onSelectionChange={setSelectedIds}
          onBulkDelete={requestBulkDelete}
        />
      </ResizableContent>
    </main>
  )
}
