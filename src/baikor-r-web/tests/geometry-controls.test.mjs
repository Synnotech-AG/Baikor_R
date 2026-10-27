import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { useForm } from 'react-hook-form'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server
let ConstructionSiteMap
let ConstructionSiteAreasSection
let ConstructionSiteDetails
let ConstructionSiteEditor
let i18n

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  })
  ;({ ConstructionSiteMap } = await server.ssrLoadModule('/src/features/construction-sites/components/ConstructionSiteMap.tsx'))
  ;({ ConstructionSiteAreasSection } = await server.ssrLoadModule('/src/features/construction-sites/components/ConstructionSiteAreasSection.tsx'))
  ;({ ConstructionSiteDetails } = await server.ssrLoadModule('/src/features/construction-sites/components/ConstructionSiteDetails.tsx'))
  ;({ ConstructionSiteEditor } = await server.ssrLoadModule('/src/features/construction-sites/components/ConstructionSiteEditor.tsx'))
  ;({ default: i18n } = await server.ssrLoadModule('/src/i18n/i18n.ts'))
})

after(async () => {
  await server?.close()
})

const noop = () => {}
const mapProps = {
  mapElementRef: { current: null },
  drawing: false,
  editingGeometry: false,
  onSelectAddress: noop,
  onCancelDrawing: noop,
  onFinishDrawing: noop,
  onFinishEditing: noop,
  // Old callers must not restore controls that are no longer offered by the UI.
  canUndoGeometry: true,
  canUndoDrawingPoint: true,
  onUndoGeometry: noop,
  onUndoDrawingPoint: noop,
}
const area = {
  key: 'area-1', id: 'area-1', name: 'Test area', areaSquareMetres: 100,
  coordinates: [[[10, 20], [30, 20], [30, 40], [10, 20]]],
}
const areaProps = {
  areas: [area], selectedAreaKey: area.key, canEdit: true,
  drawing: false, editingGeometry: false, canUndoGeometry: true,
  onToggleDrawing: noop, onToggleEditingGeometry: noop,
  onUndoGeometry: noop, onSelectArea: noop, onDeleteArea: noop,
}

function render(Component, props) {
  return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n },
    React.createElement(Component, props)))
}

// Inspect rendered HTML rather than component source. Buttons contain nested
// Ant Design icons, so their accessible name may come from aria-label or text.
function textContent(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').trim()
}

function buttons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attributes, content]) => ({
    name: attributes.match(/\baria-label="([^"]*)"/)?.[1] ?? textContent(content),
    text: textContent(content),
    disabled: /(?:^|\s)disabled(?:=|\s|$)/.test(attributes),
    attributes,
  }))
}

function namedButton(html, name) {
  const matching = buttons(html).filter((button) => button.name === name)
  assert.equal(matching.length, 1, `Expected one accessible button named "${name}"; got ${buttons(html).map((button) => button.name).join(', ')}`)
  return matching[0]
}

function areaCards(html) {
  return [...html.matchAll(/<div\b([^>]*)>/g)].map(([, attributes]) => attributes)
    .filter((attributes) => /\bclass="[^"]*\barea-card\b/.test(attributes) && /\brole="button"/.test(attributes))
}

function elementWithClass(html, tagName, className) {
  const opening = [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, 'g'))]
    .find((match) => match[1].match(/\bclass="([^"]*)"/)?.[1].split(/\s+/).includes(className))
  assert.ok(opening, `Expected a rendered ${tagName}.${className}`)
  const tags = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'g')
  tags.lastIndex = opening.index + opening[0].length
  let depth = 1
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[1] ? -1 : 1
    if (depth === 0) return html.slice(opening.index, tags.lastIndex)
  }
  assert.fail(`Missing closing tag for ${tagName}.${className}`)
}

function assertRecordFooter(html, primaryNames, deleteAllowed) {
  const footer = elementWithClass(html, 'footer', 'record-footer')
  const actions = elementWithClass(footer, 'div', 'record-footer-actions')
  const primary = elementWithClass(actions, 'div', 'record-footer-primary')
  assert.deepEqual(buttons(primary).map((button) => button.name), primaryNames, 'Record actions must be grouped together before the separate delete action')
  const deleteName = i18n.t('constructionSites.delete.action')
  assert.deepEqual(buttons(actions).map((button) => button.name), [...primaryNames, ...(deleteAllowed ? [deleteName] : [])], 'Delete must follow the left action group in footer reading and keyboard order')
  assert.ok(!/\bclass="[^"]*\brecord-save-state\b/.test(html), 'The generic save-state paragraph must not appear in any record state')
  if (deleteAllowed) {
    const deletion = namedButton(footer, deleteName)
    assert.equal(deletion.text, '', 'Delete must stay a compact icon action')
    assert.match(deletion.attributes, /\bant-btn-text\b/)
  }
  return footer
}

function assertNoHistoryButtons(html) {
  const names = buttons(html).map((button) => button.name)
  assert.ok(!names.includes(i18n.t('geometry.undoPoint')), 'Point undo must not appear among the drawing controls')
  assert.ok(!names.includes(i18n.t('geometry.undo')), 'Geometry undo must not appear among the map or details controls')
}

for (const language of ['de', 'en']) {
  test(`map drawing uses compact status and only finish/cancel actions (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(ConstructionSiteMap, { ...mapProps, drawing: true, canEditGeometry: true, onStartEditing: noop })
    const statuses = [...html.matchAll(/<([a-z]+)\b[^>]*\brole="status"[^>]*>([\s\S]*?)<\/\1>/g)]
      .map((match) => textContent(match[2])).filter(Boolean)
    assert.deepEqual(statuses, [i18n.t('geometry.draw')], 'Drawing status must be a compact label')
    assert.equal(namedButton(html, i18n.t('geometry.finishDrawing')).disabled, false)
    namedButton(html, i18n.t('geometry.cancelDrawing'))
    assertNoHistoryButtons(html)
    assert.ok(!buttons(html).some((button) => button.name === i18n.t('geometry.edit')))
    assert.ok(![...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
      .some((match) => textContent(match[1]) === i18n.t('geometry.drawingHint')), 'Long drawing instructions must not occupy a paragraph')
  })

  test(`map finish action reflects whether a polygon can be completed (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const canFinishDrawing of [false, true]) {
      const html = render(ConstructionSiteMap, { ...mapProps, drawing: true, canFinishDrawing })
      assert.equal(namedButton(html, i18n.t('geometry.finishDrawing')).disabled, !canFinishDrawing)
    }
  })

  test(`editor offers a new-area card or drawing cancellation without inspection instructions (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const state of [{ drawing: false, editingGeometry: false }, { drawing: true, editingGeometry: false }, { drawing: false, editingGeometry: true }]) {
      const html = render(ConstructionSiteAreasSection, { ...areaProps, ...state })
      const actions = buttons(html).filter((button) => button.name !== i18n.t('constructionSites.deleteArea', { name: area.name }))
      assert.deepEqual(actions.map((button) => button.name), [state.drawing ? i18n.t('geometry.cancelDrawing') : language === 'de' ? 'Neue Fläche' : 'New area'])
      assert.equal(actions[0].disabled, false)
      if (!state.drawing) {
        assert.match(actions[0].attributes, /\barea-card-add\b/, 'The add action must share the area-card list presentation')
        assert.match(actions[0].attributes, /\bant-btn-dashed\b/, 'The new-area card must have a dashed outline')
      }
      assert.ok(!textContent(html).includes(i18n.t('geometry.inspectHint')), 'The redundant selection hint must not be rendered')
      assertNoHistoryButtons(html)
    }
  })

  test(`an empty editable area list offers the same new-area card (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(ConstructionSiteAreasSection, { ...areaProps, areas: [], selectedAreaKey: null })
    const add = namedButton(html, language === 'de' ? 'Neue Fläche' : 'New area')
    assert.equal(add.disabled, false)
    assert.match(add.attributes, /\barea-card-add\b/)
    assert.match(add.attributes, /\bant-btn-dashed\b/)
    assert.ok(!textContent(html).includes(i18n.t('geometry.emptyEditable')), 'A card should replace the old empty-state drawing instructions')
  })
}

test('idle map offers one icon-only edit control when editing is permitted', () => {
  const html = render(ConstructionSiteMap, { ...mapProps, canEditGeometry: true, onStartEditing: noop })
  const edit = namedButton(html, i18n.t('geometry.edit'))
  assert.equal(edit.text, '', 'The edit action must be icon-only with an accessible name')
  assert.equal(edit.disabled, false)
  assertNoHistoryButtons(html)
})

test('map hides the edit control when access is denied or omitted', () => {
  for (const permission of [{}, { canEditGeometry: false }]) {
    const html = render(ConstructionSiteMap, { ...mapProps, ...permission, onStartEditing: noop })
    assert.ok(!buttons(html).some((button) => button.name === i18n.t('geometry.edit')))
    assertNoHistoryButtons(html)
  }
})

test('map editing offers finish and no edit or history controls', () => {
  const html = render(ConstructionSiteMap, { ...mapProps, editingGeometry: true, canEditGeometry: true, onStartEditing: noop })
  namedButton(html, i18n.t('geometry.finishEditing'))
  assert.ok(!buttons(html).some((button) => button.name === i18n.t('geometry.edit')))
  assertNoHistoryButtons(html)
})

test('area deletion remains available only to editors in editing mode outside drawing', () => {
  for (const [canEdit, editingGeometry, drawing, canDelete] of [
    [false, false, false, false], [false, true, false, false],
    [true, false, false, false], [true, true, false, true],
    [true, true, true, false],
  ]) {
    const html = render(ConstructionSiteAreasSection, { ...areaProps, canEdit, editingGeometry, drawing })
    assert.equal(buttons(html).some((button) => button.name === i18n.t('constructionSites.deleteArea', { name: area.name })), canDelete)
    assert.match(html, /aria-pressed="true"/, 'The selected geometry must remain visible in the list')
    if (!canEdit) assert.equal(buttons(html).length, 0, 'Read-only details must offer no geometry actions')
  }
})

const site = {
  id: 'site-save-flow', title: 'Save flow test', status: 'draft',
  plannedStart: null, plannedEnd: null, areaSquareMetres: 0, areas: [],
  diversion: null, contacts: [], communications: [], metadata: {},
  updatedAt: '2026-10-23T10:00:00Z', version: 2,
}

const detailsProps = {
  site, canEdit: true, canApprove: true, reviewing: false,
  selectedAreaKey: null, onSelectArea: noop,
  deleting: false, onDelete: noop, onEdit: noop, onChangeStatus: noop,
}

const editorProps = {
  selectedSite: site, areas: [], selectedAreaKey: null,
  canEdit: true, isNew: false, drawing: false, editingGeometry: false,
  geometryDirty: false, feedback: null, saving: false, deleting: false,
  onSubmit: noop, onToggleDrawing: noop, onSelectArea: noop,
  onDeleteArea: noop, onDiscard: noop, onDelete: noop,
}

function EditorWithForm({ dirtyForm = false, ...props }) {
  const form = useForm({ defaultValues: {
    title: site.title, status: site.status, plannedStart: '', plannedEnd: '',
    diversion: '', contacts: [], communications: [], metadata: [],
  } })
  // The editor receives this state from its form owner. Keep real RHF controls
  // for the rendered fields while varying the subscribed dirty-state input.
  return React.createElement(ConstructionSiteEditor, {
    ...props, form: { ...form, formState: { ...form.formState, errors: form.formState.errors, isDirty: dirtyForm } },
  })
}

for (const language of ['de', 'en']) {
  test(`read-only details offer keyboard-focusable area cards without geometry mutations (${language})`, async () => {
    await i18n.changeLanguage(language)
    const savedArea = {
      id: 'saved-area-1', name: 'Northern work zone', areaSquareMetres: 100,
      geometry: { type: 'Polygon', coordinates: area.coordinates },
    }
    for (const canEdit of [false, true]) {
      for (const selectedAreaKey of [null, savedArea.id]) {
        const html = render(ConstructionSiteDetails, { ...detailsProps, canEdit, selectedAreaKey, site: { ...site, areas: [savedArea] } })
        const cards = areaCards(html)
        assert.equal(cards.length, 1, 'Each saved area must remain a navigable card in the read-only view')
        assert.match(cards[0], /\btabindex="0"/, 'The area card must remain reachable by keyboard')
        assert.match(cards[0], new RegExp(`\\baria-pressed="${selectedAreaKey === savedArea.id}"`), 'The selected area must be identified accessibly')
        assert.ok(textContent(html).includes(savedArea.name), 'The saved area name must remain visible')
        const names = buttons(html).map((button) => button.name)
        assert.ok(!names.includes(language === 'de' ? 'Neue Fläche' : 'New area'), 'Read-only details must not offer area creation, even to users who can edit')
        assert.ok(!names.includes(i18n.t('constructionSites.deleteArea', { name: savedArea.name })), 'Read-only details must not offer area deletion')
      }
    }
  })

  test(`details always show additional data, including empty groups (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const record of [site, {
      ...site, diversion: 'Use the eastern route',
      contacts: [{ id: 'contact-1', firstName: 'Alex', lastName: 'Smith', role: 'Coordinator', email: null, phone1: null, phone2: null }],
      communications: [{ id: 'communication-1', type: 'Notice', note: 'Keep access clear' }],
      metadata: { contractor: 'Example company' },
    }]) {
      const html = render(ConstructionSiteDetails, { ...detailsProps, site: record })
      assert.ok(!/<(?:details|summary)\b/.test(html), 'Additional data must not be a collapsible disclosure')
      assert.ok(/<section\b[^>]*class="[^"]*record-additional/.test(html), 'Additional data must be a persistent section')
      for (const key of ['contacts.label', 'diversion.label', 'communications.label', 'metadata.label']) {
        assert.ok(textContent(html).includes(i18n.t(`constructionSites.${key}`)), `Missing additional-data group ${key}`)
      }
      if (record.diversion) {
        for (const content of ['Use the eastern route', 'Alex Smith', 'Keep access clear', 'Example company']) {
          assert.ok(textContent(html).includes(content), `Missing saved additional data: ${content}`)
        }
      }
    }
  })

  test(`details keep status read-only and gate the edit action (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const canEdit of [false, true]) {
      const html = render(ConstructionSiteDetails, { ...detailsProps, canEdit })
      assert.ok(!/role="combobox"/.test(html), 'Read-only details must not have an editable status selector')
      assert.ok(/class="[^"]*construction-site-status status-draft/.test(html), 'The current status remains visible as read-only information')
      assert.ok(!buttons(html).some((button) => button.name === i18n.t('record.review.apply')), 'Status must not have a separate save action')
      assert.equal(buttons(html).some((button) => button.name === i18n.t('record.edit')), canEdit)
      assertRecordFooter(html, canEdit ? [i18n.t('record.edit')] : [], canEdit)
      const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? ''
      assert.ok(!buttons(header).some((button) => button.name === i18n.t('record.edit')), 'Edit belongs in the footer, leaving the record header for the title')
    }
  })

  test(`read-only footer disables edit and delete during deletion (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(ConstructionSiteDetails, { ...detailsProps, deleting: true })
    const footer = assertRecordFooter(html, [i18n.t('record.edit')], true)
    assert.equal(namedButton(footer, i18n.t('record.edit')).disabled, true)
    assert.equal(namedButton(footer, i18n.t('constructionSites.delete.action')).disabled, true)
  })

  test(`pristine existing editor offers back and subtle delete without save, discard, or cancel (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(EditorWithForm, editorProps)
    assert.ok(!buttons(html).some((button) => button.name === i18n.t('constructionSites.save')), 'Save should only appear when changes exist')
    assert.ok(!buttons(html).some((button) => button.name === i18n.t('constructionSites.discard')), 'Discard should only appear when changes exist or a new draft is being created')
    assert.ok(!buttons(html).some((button) => button.name === i18n.t('common.cancel')), 'The footer must not have a separate close action')
    assert.equal(namedButton(html, language === 'de' ? 'Zurück' : 'Back').disabled, false, 'Back must let an unchanged editor return to read-only details')
    assert.ok(!/\bclass="[^"]*\brecord-save-state\b/.test(html), 'An unchanged record does not need a saved-status message')
    const deleteAction = namedButton(html, i18n.t('constructionSites.delete.action'))
    assert.equal(deleteAction.disabled, false)
    assert.equal(deleteAction.text, '', 'Delete must remain an icon-only button with an accessible name')
    assert.match(deleteAction.attributes, /\bant-btn-text\b/, 'Delete must retain its subtle text-button appearance')
    assertRecordFooter(html, [language === 'de' ? 'Zurück' : 'Back'], true)
  })

  test(`pristine editor back action is unavailable during a pending request (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const state of [{ saving: true }, { deleting: true }]) {
      const html = render(EditorWithForm, { ...editorProps, ...state })
      assert.equal(namedButton(html, language === 'de' ? 'Zurück' : 'Back').disabled, true)
      assert.ok(!buttons(html).some((button) => button.name === i18n.t('constructionSites.save')))
      assert.ok(!buttons(html).some((button) => button.name === i18n.t('constructionSites.discard')))
      assertRecordFooter(html, [language === 'de' ? 'Zurück' : 'Back'], true)
    }
  })

  test(`one editor save handles new, form, geometry, and unfinished drawing states (${language})`, async () => {
    await i18n.changeLanguage(language)
    for (const state of [
      { isNew: true, selectedSite: null }, { dirtyForm: true },
      { geometryDirty: true }, { drawing: true },
    ]) {
      const html = render(EditorWithForm, { ...editorProps, ...state })
      assert.equal(namedButton(html, i18n.t(state.isNew ? 'record.create' : 'constructionSites.save')).disabled, Boolean(state.drawing))
      assert.equal(namedButton(html, i18n.t('constructionSites.discard')).disabled, false)
      assert.ok(!buttons(html).some((button) => button.name === (language === 'de' ? 'Zurück' : 'Back')), 'Changed records and new drafts must offer discard instead of back')
      assert.ok(!buttons(html).some((button) => button.name === i18n.t('common.cancel')), 'Saving and discarding replace the separate close action')
      assert.equal(buttons(html).some((button) => button.name === i18n.t('constructionSites.delete.action')), !state.isNew)
      assert.ok(!buttons(html).some((button) => button.name === i18n.t('record.review.apply')))
      assert.ok(/id="status"[^>]*role="combobox"/.test(html), 'Status stays in the general editor and uses its global save')
      assertRecordFooter(html, [i18n.t('constructionSites.discard'), i18n.t(state.isNew ? 'record.create' : 'constructionSites.save')], !state.isNew)
    }
  })

  test(`saving keeps disabled footer actions without a generic status paragraph (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(EditorWithForm, { ...editorProps, saving: true })
    const footer = assertRecordFooter(html, [language === 'de' ? 'Zurück' : 'Back'], true)
    assert.equal(namedButton(footer, language === 'de' ? 'Zurück' : 'Back').disabled, true)
  })

  test(`editor error feedback stays visible beside persistent footer actions (${language})`, async () => {
    await i18n.changeLanguage(language)
    const html = render(EditorWithForm, { ...editorProps, dirtyForm: true, feedback: { type: 'error', message: 'Write rejected by server' } })
    const footer = assertRecordFooter(html, [i18n.t('constructionSites.discard'), i18n.t('constructionSites.save')], true)
    assert.ok(textContent(footer).includes('Write rejected by server'), 'Removing generic status text must not hide save errors')
  })
}

test('editor write actions remain unavailable without permission and during a pending request', () => {
  const deniedHtml = render(EditorWithForm, { ...editorProps, canEdit: false, dirtyForm: true })
  assert.ok(!buttons(deniedHtml).some((button) => button.name === i18n.t('constructionSites.delete.action')))
  for (const name of [i18n.t('constructionSites.save'), i18n.t('constructionSites.discard')]) {
    const action = buttons(deniedHtml).find((button) => button.name === name)
    assert.ok(!action || action.disabled, `${name} must not allow writes without permission`)
  }
  assert.ok(!buttons(deniedHtml).some((button) => button.name === i18n.t('common.cancel')))
  assertRecordFooter(deniedHtml, [i18n.t('constructionSites.discard'), i18n.t('constructionSites.save')], false)

  for (const state of [{ saving: true }, { deleting: true }]) {
    const html = render(EditorWithForm, { ...editorProps, dirtyForm: true, ...state })
    assert.equal(namedButton(html, i18n.t('constructionSites.save')).disabled, true)
    assert.equal(namedButton(html, i18n.t('constructionSites.discard')).disabled, true)
    assert.equal(namedButton(html, i18n.t('constructionSites.delete.action')).disabled, true)
    assert.ok(!buttons(html).some((button) => button.name === i18n.t('common.cancel')))
    assertRecordFooter(html, [i18n.t('constructionSites.discard'), i18n.t('constructionSites.save')], true)
  }
})
