import { CheckOutlined, FilterOutlined } from '@ant-design/icons'
import { Alert, App, Button, Dropdown, Empty, Input, Modal, Table, Tag, Tooltip } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../api/errors'
import {
  getRoute,
  getRoutes,
  useDeleteRouteEndpoint,
  useDeleteRoutePathEndpoint,
  useRestoreRouteEndpoint,
  useRestoreRoutePathEndpoint,
  useSaveRouteEndpoint,
} from './api'
import { RouteImport } from './route-import'
import { RouteForm } from './route-form'
import { RoutePathCards } from './route-path-cards'
import { RouteActions } from './route-actions'
import { RouteCreateButton } from './route-create-button'
import {
  createRouteDraftScope,
  createRouteForm,
  createRoutePathForm,
  routeFormIsValid,
  toRoutePathFocus,
  parseProjectedRouteGeometry,
  routeFormIsDirty,
  toRouteWriteRequest,
} from './route-model'
import type { MultiLineStringDto, PagedRoutes, RouteFormValues, RoutePathResponse } from './types'
import './routes-widget.css'

export interface RoutesWidgetProps {
  canEdit: boolean
  antiforgeryReady: boolean
  onFocusRoute: (route: RoutePathResponse, focusGeometry?: boolean) => void
  onDrawRoute: (onComplete: (geometry: MultiLineStringDto) => void) => void
  onChanged?: () => void
  selectedRouteId?: string | null
  selectedPathId?: string | null
  selectionToken?: number
  focusSelectedRoute?: boolean
  routeDrawing?: boolean
  onCancelRouteDrawing?: () => void
}

export function RoutesWidget({
  canEdit,
  antiforgeryReady,
  onFocusRoute,
  onDrawRoute,
  onChanged,
  selectedRouteId,
  selectedPathId = null,
  selectionToken = 0,
  focusSelectedRoute = true,
  routeDrawing = false,
  onCancelRouteDrawing,
}: RoutesWidgetProps) {
  const { t, i18n } = useTranslation()
  const { notification, modal } = App.useApp()
  const [search, setSearch] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [list, setList] = useState<PagedRoutes | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<RoutePathResponse | null>(null)
  const [editing, setEditing] = useState(false)
  const [activePathId, setActivePathId] = useState<string | null>(null)
  const activePathIdRef = useRef(activePathId)
  activePathIdRef.current = activePathId
  const [selectedPathKey, setSelectedPathKey] = useState<string | null>(null)
  const [form, setForm] = useState<RouteFormValues>(createRouteForm)
  const [originalForm, setOriginalForm] = useState<RouteFormValues>(createRouteForm)
  const [draftScope] = useState(createRouteDraftScope)
  const [error, setError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const saveEndpoint = useSaveRouteEndpoint()
  const deleteEndpoint = useDeleteRouteEndpoint()
  const restoreEndpoint = useRestoreRouteEndpoint()
  const restorePathEndpoint = useRestoreRoutePathEndpoint()
  const deletePathEndpoint = useDeleteRoutePathEndpoint()
  const writable = canEdit && antiforgeryReady
  const canChange =
    writable &&
    !saveEndpoint.isLoading &&
    !deleteEndpoint.isLoading &&
    !deletePathEndpoint.isLoading &&
    !restoreEndpoint.isLoading &&
    !restorePathEndpoint.isLoading
  const draftStateRef = useRef({
    editing,
    form,
    originalForm,
    saving: saveEndpoint.isLoading,
    drawing: routeDrawing,
  })
  draftStateRef.current = {
    editing,
    form,
    originalForm,
    saving: saveEndpoint.isLoading,
    drawing: routeDrawing,
  }
  const discardModalRef = useRef<{ destroy: () => void } | null>(null)
  const pendingTransitionRef = useRef<(() => void) | null>(null)
  const externalRequestRef = useRef<AbortController | null>(null)
  const onFocusRouteRef = useRef(onFocusRoute)
  onFocusRouteRef.current = onFocusRoute
  const cancelDrawingRef = useRef(onCancelRouteDrawing)
  cancelDrawingRef.current = onCancelRouteDrawing
  const updateForm = useCallback((changes: Partial<RouteFormValues>) => {
    const next = { ...draftStateRef.current.form, ...changes }
    draftStateRef.current.form = next
    setForm(next)
  }, [])

  const requestTransition = useCallback(
    (proceed: () => void) => {
      const current = draftStateRef.current
      if (current.saving) {
        return
      }
      if (
        !current.editing ||
        (!current.drawing && !routeFormIsDirty(current.form, current.originalForm))
      ) {
        proceed()
        return
      }
      pendingTransitionRef.current = proceed
      if (discardModalRef.current) {
        return
      }
      discardModalRef.current = modal.confirm({
        title: t('routes.discardTitle'),
        content: t('routes.discardMessage'),
        okText: t('routes.discard'),
        cancelText: t('routes.keepEditing'),
        onOk: () => {
          const action = pendingTransitionRef.current
          pendingTransitionRef.current = null
          discardModalRef.current = null
          action?.()
        },
        onCancel: () => {
          pendingTransitionRef.current = null
          discardModalRef.current = null
        },
      })
    },
    [modal, t],
  )
  const requestTransitionRef = useRef(requestTransition)
  requestTransitionRef.current = requestTransition

  const describeError = useCallback(
    (caught: unknown, fallback = 'routes.failed') => {
      const parsed = parseApiError(caught, t(fallback))
      return parsed.errorKey && i18n.exists(parsed.errorKey) ? t(parsed.errorKey) : parsed.message
    },
    [t, i18n],
  )
  const describeErrorRef = useRef(describeError)
  describeErrorRef.current = describeError

  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent) => {
      const current = draftStateRef.current
      if (
        current.editing &&
        (current.drawing || routeFormIsDirty(current.form, current.originalForm))
      ) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [])

  useEffect(
    () => () => {
      draftScope.invalidate()
      externalRequestRef.current?.abort()
      discardModalRef.current?.destroy()
      pendingTransitionRef.current = null
    },
    [draftScope],
  )

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void getRoutes(
      { search: search.trim(), page, pageSize: 25, includeSuppressed: includeDeleted },
      controller.signal,
    )
      .then((result) => {
        setList(result)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(describeError(caught))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [search, page, refresh, describeError, includeDeleted])

  useEffect(() => {
    if (!selectedRouteId) {
      return
    }
    const controller = new AbortController()
    externalRequestRef.current?.abort()
    externalRequestRef.current = controller
    void getRoute(selectedRouteId, controller.signal, true)
      .then((route) => {
        if (!controller.signal.aborted) {
          requestTransitionRef.current(() => {
            if (controller.signal.aborted) {
              return
            }
            draftScope.invalidate()
            draftStateRef.current.editing = false
            cancelDrawingRef.current?.()
            setSelected(route)
            setActivePathId(selectedPathId)
            setEditing(false)
            setError(null)
            onFocusRouteRef.current(
              (selectedPathId && toRoutePathFocus(route, selectedPathId)) || route,
              focusSelectedRoute,
            )
          })
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(describeErrorRef.current(caught))
        }
      })
    return () => controller.abort()
  }, [selectedRouteId, selectedPathId, selectionToken, focusSelectedRoute, draftScope])

  const changed = () => {
    setRefresh((value) => value + 1)
    onChanged?.()
  }
  const beginEdit = (route: RoutePathResponse | null) => {
    externalRequestRef.current?.abort()
    requestTransition(() => {
      const nextForm = createRouteForm(route)
      const original = structuredClone(route ? nextForm : createRouteForm())
      draftScope.invalidate()
      draftStateRef.current = {
        editing: true,
        form: nextForm,
        originalForm: original,
        saving: false,
        drawing: false,
      }
      cancelDrawingRef.current?.()
      setSelected(route)
      setActivePathId(null)
      setSelectedPathKey(nextForm.paths[0]?.key ?? null)
      setForm(nextForm)
      setOriginalForm(original)
      setError(null)
      setEditing(true)
    })
  }
  const save = async () => {
    if (!canChange || routeDrawing || !routeFormIsValid(form)) {
      setError(t('routes.invalidForm'))
      return
    }
    draftStateRef.current.saving = true
    draftScope.invalidate()
    try {
      const route = await saveEndpoint.execute(
        selected?.id ?? null,
        toRouteWriteRequest(form, selected?.version),
      )
      setSelected(route)
      draftStateRef.current.editing = false
      cancelDrawingRef.current?.()
      setEditing(false)
      setError(null)
      notification.success({ message: t('routes.saved') })
      changed()
      onFocusRoute(route)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      draftStateRef.current.saving = false
    }
  }
  const remove = async () => {
    if (!selected || !canChange) {
      return
    }
    const isCurrent = draftScope.capture()
    const target = selected
    try {
      await deleteEndpoint.execute(target.id)
      notification.success({ message: t('routes.removed') })
      changed()
      if (isCurrent()) {
        setSelected(null)
        setError(null)
        onFocusRoute({ ...target, isSuppressed: true }, false)
      }
    } catch (caught) {
      if (isCurrent()) {
        setError(describeError(caught))
      }
    }
  }
  const restore = async () => {
    if (!selected?.isSuppressed || !writable) {
      return
    }
    const isCurrent = draftScope.capture()
    try {
      const route = await restoreEndpoint.execute(selected.id, selected.version)
      notification.success({ message: t('routes.restored') })
      changed()
      if (isCurrent()) {
        setSelected(route)
        setError(null)
        onFocusRoute(route)
      }
    } catch (caught) {
      if (isCurrent()) {
        setError(describeError(caught))
      }
    }
  }
  const select = (route: RoutePathResponse) => {
    externalRequestRef.current?.abort()
    requestTransition(() => {
      draftScope.invalidate()
      draftStateRef.current.editing = false
      cancelDrawingRef.current?.()
      setSelected(route)
      setActivePathId(null)
      setEditing(false)
      setError(null)
      onFocusRoute(route)
    })
  }
  const restorePath = async (pathId: string) => {
    if (!selected || selected.isSuppressed || !canChange) {
      return
    }
    const isCurrent = draftScope.capture()
    try {
      const route = await restorePathEndpoint.execute(selected.id, pathId, selected.version)
      notification.success({ message: t('routes.pathRestored') })
      changed()
      if (isCurrent()) {
        setSelected(route)
        setError(null)
        setActivePathId(pathId)
        onFocusRoute(toRoutePathFocus(route, pathId) ?? route)
      }
    } catch (caught) {
      if (isCurrent()) {
        setError(describeError(caught))
      }
    }
  }
  const deletePath = async (pathId: string) => {
    if (!selected || selected.isSuppressed || !canChange) {
      return
    }
    const isCurrent = draftScope.capture()
    try {
      const route = await deletePathEndpoint.execute(selected.id, pathId, selected.version)
      notification.success({ message: t('routes.pathDeleted') })
      changed()
      if (isCurrent()) {
        setSelected(route)
        setError(null)
        const currentPathId = activePathIdRef.current
        const retainedPathId = currentPathId === pathId ? null : currentPathId
        setActivePathId(retainedPathId)
        onFocusRoute((retainedPathId && toRoutePathFocus(route, retainedPathId)) || route, false)
      }
    } catch (caught) {
      if (isCurrent()) {
        setError(describeError(caught))
      }
    }
  }
  const closeEditor = (clearSelection: boolean) => {
    externalRequestRef.current?.abort()
    requestTransition(() => {
      draftScope.invalidate()
      draftStateRef.current.editing = false
      cancelDrawingRef.current?.()
      setEditing(false)
      if (clearSelection) {
        setSelected(null)
      }
    })
  }
  const selectDraftPath = (key: string) => {
    draftScope.invalidate()
    cancelDrawingRef.current?.()
    setSelectedPathKey(key)
  }
  const updatePathGeometry = (key: string, geometry: MultiLineStringDto) => {
    updateForm({
      paths: draftStateRef.current.form.paths.map((path) =>
        path.key === key ? { ...path, geometry } : path,
      ),
    })
  }
  const startDrawing = (key: string) => {
    if (!canChange) {
      return
    }
    selectDraftPath(key)
    const isCurrent = draftScope.capture()
    onDrawRoute((geometry) => {
      if (isCurrent() && draftStateRef.current.editing) {
        updatePathGeometry(key, geometry)
      }
    })
  }
  const uploadGeometry = (key: string, file: File) => {
    if (!canChange) {
      return
    }
    selectDraftPath(key)
    const isCurrent = draftScope.capture()
    void file
      .text()
      .then((text) => {
        if (isCurrent() && draftStateRef.current.editing) {
          updatePathGeometry(key, parseProjectedRouteGeometry(JSON.parse(text)))
          setError(null)
        }
      })
      .catch(() => {
        if (isCurrent() && draftStateRef.current.editing) {
          setError(t('routes.invalidGeometry'))
        }
      })
  }
  const hasDetails = selected || editing

  return (
    <section
      className={`routes-widget${hasDetails ? ' routes-has-details' : ''}${editing ? ' routes-editing' : ''}`}
      aria-label={t('routes.title')}
    >
      <div className="route-toolbar">
        <Input.Search
          maxLength={200}
          aria-label={t('routes.search')}
          placeholder={t('routes.search')}
          value={search}
          allowClear
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        <RouteCreateButton
          canEdit={canEdit}
          ready={canChange}
          labels={{
            create: t('routes.new'),
            import: t('routes.import'),
            options: t('routes.createOptions'),
          }}
          onCreate={() => beginEdit(null)}
          onImport={() => {
            externalRequestRef.current?.abort()
            requestTransition(() => {
              draftScope.invalidate()
              draftStateRef.current.editing = false
              cancelDrawingRef.current?.()
              setEditing(false)
              setShowImport(true)
            })
          }}
        />
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              {
                key: 'deleted',
                label: t('routes.showDeleted'),
                icon: includeDeleted ? <CheckOutlined /> : undefined,
                onClick: () => {
                  setIncludeDeleted((value) => !value)
                  setPage(1)
                },
              },
            ],
          }}
        >
          <Tooltip title={t('routes.listOptions')}>
            <Button
              icon={<FilterOutlined />}
              className={includeDeleted ? 'route-filter-active' : undefined}
              aria-label={t('routes.listOptions')}
              aria-pressed={includeDeleted}
              aria-haspopup="menu"
            />
          </Tooltip>
        </Dropdown>
      </div>
      {error && (
        <Alert
          className="route-widget-error"
          type="error"
          showIcon
          title={error}
          closable
          onClose={() => setError(null)}
        />
      )}
      <div className="route-workspace">
        <div className="route-list">
          <Table<RoutePathResponse>
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={list?.items ?? []}
            locale={{ emptyText: t('routes.empty') }}
            columns={[
              {
                title: t('routes.name'),
                dataIndex: 'title',
                render: (_: string, route) => (
                  <Button
                    className="route-title-button"
                    type="link"
                    onClick={(event) => {
                      event.stopPropagation()
                      select(route)
                    }}
                  >
                    {route.title}
                    {route.isSuppressed && <Tag>{t('routes.hidden')}</Tag>}
                  </Button>
                ),
              },
              {
                title: t('routes.paths'),
                width: 80,
                render: (_: unknown, route) =>
                  route.paths.filter((path) => !path.isSuppressed).length,
              },
            ]}
            rowClassName={(route) => (route.id === selected?.id ? 'route-selected-row' : '')}
            onRow={(route) => ({ onClick: () => select(route) })}
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
        <article className="route-details">
          {hasDetails && (
            <Button className="route-back" type="text" onClick={() => closeEditor(true)}>
              {t('routes.back')}
            </Button>
          )}
          {editing ? (
            <>
              <div className="route-details-scroll route-form">
                <h3>{t(selected ? 'routes.edit' : 'routes.new')}</h3>
                <RouteForm
                  key={selected?.id ?? 'new'}
                  form={form}
                  enabled={canChange}
                  selectedPathKey={selectedPathKey}
                  onChange={updateForm}
                  onSelectPath={selectDraftPath}
                  onDraw={startDrawing}
                  onUpload={uploadGeometry}
                  onAddPath={() => {
                    const path = createRoutePathForm(
                      t('routes.pathNumber', { number: form.paths.length + 1 }),
                    )
                    selectDraftPath(path.key)
                    updateForm({ paths: [...draftStateRef.current.form.paths, path] })
                  }}
                  onRemovePath={(key) => {
                    const paths = draftStateRef.current.form.paths
                    if (paths.length > 1) {
                      const remaining = paths.filter((path) => path.key !== key)
                      selectDraftPath(remaining[0].key)
                      updateForm({ paths: remaining })
                    }
                  }}
                />
              </div>
              <footer className="route-footer">
                <Button
                  type="primary"
                  loading={saveEndpoint.isLoading}
                  disabled={!canChange || routeDrawing || !routeFormIsValid(form)}
                  onClick={() => {
                    void save()
                  }}
                >
                  {t('common.save')}
                </Button>
                <Button disabled={saveEndpoint.isLoading} onClick={() => closeEditor(false)}>
                  {t('common.cancel')}
                </Button>
              </footer>
            </>
          ) : selected ? (
            <>
              <div className="route-details-scroll">
                <h3>{selected.title}</h3>
                {selected.isSuppressed && (
                  <Alert
                    type="info"
                    showIcon
                    title={t('routes.hidden')}
                    description={t('routes.hiddenHint')}
                  />
                )}
                {!selected.sourceId && selected.description && (
                  <p className="route-description">{selected.description}</p>
                )}
                <RoutePathCards
                  route={selected}
                  selectedPathId={activePathId}
                  canRestore={canChange}
                  restoring={restorePathEndpoint.isLoading}
                  canDelete={canChange}
                  deleting={deletePathEndpoint.isLoading}
                  includeDeleted={includeDeleted}
                  onDelete={(pathId) => {
                    void deletePath(pathId)
                  }}
                  onRestore={(pathId) => {
                    void restorePath(pathId)
                  }}
                  onSelect={(pathId) => {
                    const target = toRoutePathFocus(selected, pathId)
                    if (target) {
                      activePathIdRef.current = pathId
                      setActivePathId(pathId)
                      onFocusRoute(target)
                    }
                  }}
                />
              </div>
              <RouteActions
                route={selected}
                canEdit={canEdit}
                ready={canChange}
                restoring={restoreEndpoint.isLoading}
                deactivating={deleteEndpoint.isLoading}
                onEdit={() => beginEdit(selected)}
                onRestore={() => {
                  void restore()
                }}
                onDeactivate={() => {
                  void remove()
                }}
              />
            </>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('routes.select')} />
          )}
        </article>
      </div>
      <Modal
        title={t('routes.importTitle')}
        open={showImport}
        closable={!importBusy}
        mask={{ closable: !importBusy }}
        keyboard={!importBusy}
        onCancel={() => {
          if (!importBusy) {
            setShowImport(false)
          }
        }}
        footer={null}
        width={680}
        destroyOnHidden
      >
        <RouteImport
          enabled={writable}
          onChanged={changed}
          onCancel={() => setShowImport(false)}
          onBusyChange={setImportBusy}
        />
      </Modal>
    </section>
  )
}
