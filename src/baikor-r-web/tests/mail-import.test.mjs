import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

let server
let model
let MailImportSection
let MailImportHistory
let MailImportSettingsForm
let api
let httpClient
let setAntiforgeryToken
const i18n = createInstance()
const saved = {
  enabled: false,
  host: 'mail.example.test',
  port: 993,
  security: 'sslOnConnect',
  username: 'import@example.test',
  folder: 'INBOX',
  pollIntervalSeconds: 60,
  bufferMetres: 1,
  hasPassword: true,
  encryptionConfigured: true,
  version: 7,
}
const noop = () => {}

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  })
  model = await server.ssrLoadModule('/src/features/import/mail-import-model.ts')
  ;({ MailImportHistory } = await server.ssrLoadModule(
    '/src/features/import/mail-import-history.tsx',
  ))
  ;({ MailImportSection } = await server.ssrLoadModule(
    '/src/features/import/mail-import-section.tsx',
  ))
  api = await server.ssrLoadModule('/src/features/import/mail-import-api.ts')
  ;({ MailImportSettingsForm } = await server.ssrLoadModule(
    '/src/features/import/mail-import-settings.tsx',
  ))
  ;({ httpClient, setAntiforgeryToken } = await server.ssrLoadModule('/src/api/http-client.ts'))
  const { mailImportDe, mailImportEn } = await server.ssrLoadModule(
    '/src/features/import/mail-import-messages.ts',
  )
  const { importDe, importEn } = await server.ssrLoadModule('/src/i18n/import-messages.ts')
  assert.deepEqual(Object.keys(mailImportDe).sort(), Object.keys(mailImportEn).sort())
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: {
      de: { translation: { ...importDe, ...mailImportDe } },
      en: { translation: { ...importEn, ...mailImportEn } },
    },
  })
})
after(async () => {
  await server?.close()
})
function render(Component, props) {
  return renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n }, React.createElement(Component, props)),
  )
}
function buttons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(
    ([, attributes, content]) => ({
      name:
        attributes.match(/\baria-label="([^"]*)"/)?.[1] ?? content.replace(/<[^>]*>/g, '').trim(),
      disabled: /(?:^|\s)disabled(?:=|\s|$)/.test(attributes),
    }),
  )
}

test('blank password preserves saved password and draft connection testing explicitly opts into it', () => {
  const draft = model.toMailImportDraft(saved)
  assert.equal(draft.password, '')
  const request = model.toMailImportRequest(draft)
  assert.equal(request.password, null)
  assert.equal(request.clearPassword, false)
  assert.equal(request.resetCursor, false)
  assert.equal(Object.hasOwn(request, 'hasPassword'), false)
  assert.equal(Object.hasOwn(request, 'encryptionConfigured'), false)
  assert.equal(model.toMailImportTestRequest(draft, saved.hasPassword).useSavedPassword, true)
  const replacement = { ...draft, password: 'new password' }
  assert.equal(model.toMailImportTestRequest(replacement, true).useSavedPassword, false)
  assert.equal(model.toMailImportRequest(replacement).password, 'new password')
  assert.equal(
    model.toMailImportTestRequest({ ...draft, clearPassword: true }, true).useSavedPassword,
    false,
  )
})

test('client validation rejects invalid TLS/port/poll/buffer and credential clearing while enabled', () => {
  const draft = model.toMailImportDraft(saved)
  assert.equal(model.validateMailImportDraft(draft, true), null)
  for (const changes of [
    { host: '' },
    { port: 0 },
    { port: 65536 },
    { security: 'none' },
    { pollIntervalSeconds: 1 },
    { bufferMetres: 0 },
    { folder: '' },
    { enabled: true, clearPassword: true },
  ]) {
    assert.ok(
      model.validateMailImportDraft({ ...draft, ...changes }, true),
      JSON.stringify(changes),
    )
  }
  assert.ok(model.validateMailImportDraft({ ...draft, enabled: true }, false))
})

test('the import overview has one settings action for admins and is hidden from other roles', () => {
  assert.equal(render(MailImportSection, { canAdmin: false, antiforgeryReady: true }), '')
  const html = render(MailImportSection, { canAdmin: true, antiforgeryReady: true })
  assert.deepEqual(
    buttons(html).map((button) => button.name),
    [i18n.t('mailImport.settings')],
  )
  assert.equal(buttons(html)[0].disabled, false)
})

test('the table shows only the attachment, completion time and plain outcome', () => {
  const row = {
    id: '1',
    fileName: '<img src=x onerror=alert(1)>.zip',
    state: 'failed',
    createdAt: '2024-02-06T10:00:00Z',
    completedAt: '2026-11-27T10:00:00Z',
    attempts: 4,
    warnings: ['technical warning'],
    canRetry: true,
  }
  const html = render(MailImportHistory, {
    history: {
      items: [row, { ...row, id: '2', state: 'imported' }],
      page: 1,
      pageSize: 20,
      totalCount: 2,
    },
    onPage: noop,
  })
  assert.ok(html.includes('&lt;img'))
  assert.equal(html.includes('<img src=x'), false)
  assert.ok(html.includes('2026'))
  assert.equal(html.includes('2024'), false)
  assert.match(html, />Failure</)
  assert.match(html, />Success</)
  assert.equal(html.includes('technical warning'), false)
  assert.equal(buttons(html).length, 0)
})

test('admin can edit an active mailbox without a saved password appearing in the form', () => {
  const active = { ...saved, enabled: true }
  const props = {
    draft: model.toMailImportDraft(active),
    saved: active,
    ready: true,
    busy: false,
    onChange: noop,
    onSave: noop,
    onTest: noop,
    onCheck: noop,
  }
  const html = render(MailImportSettingsForm, props)
  assert.match(html, /<input[^>]*id="mail-import-password"[^>]*value=""/)
  for (const id of ['host', 'port', 'security', 'username', 'folder']) {
    const input = [...html.matchAll(/<input\b[^>]*>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes(`id="mail-import-${id}"`))
    assert.ok(input, id)
    assert.doesNotMatch(input, /disabled/)
  }
  assert.doesNotMatch(html, /mail-import-(?:interval|buffer)/)
  assert.equal(
    buttons(html).find((button) => button.name === i18n.t('mailImport.checkNow'))?.disabled,
    false,
  )
  const dirty = render(MailImportSettingsForm, {
    ...props,
    draft: { ...props.draft, folder: 'Other' },
  })
  assert.equal(
    buttons(dirty).find((button) => button.name === i18n.t('mailImport.checkNow'))?.disabled,
    true,
  )
  const locked = buttons(render(MailImportSettingsForm, { ...props, ready: false }))
  assert.equal(locked.find((button) => button.name === i18n.t('mailImport.save'))?.disabled, true)
})

test('retrying work and actionable backend errors resolve in both languages', async () => {
  for (const language of ['de', 'en']) {
    await i18n.changeLanguage(language)
    for (const key of [
      'mailImport.failure',
      'mailImport.uidValidityChanged',
      'mailImport.authenticationFailed',
      'mailImport.encryptionUnavailable',
      'mailImport.conflict',
      'mailImport.attachmentMissing',
      'mailImport.attachmentTooLarge',
    ]) {
      assert.equal(i18n.exists(key), true, key)
    }
  }
  await i18n.changeLanguage('en')
})

test('manual import translates existing importer warnings and preserves unknown warning text safely', async () => {
  const { describeImportWarning } = await server.ssrLoadModule(
    '/src/features/import/import-warning.ts',
  )
  for (const language of ['de', 'en']) {
    await i18n.changeLanguage(language)
    assert.equal(
      describeImportWarning(
        'The source contains line geometries without a construction width; each line was buffered using the configured area buffer.',
        i18n.t.bind(i18n),
      ),
      i18n.t('importUx.warnings.buffered'),
    )
    assert.equal(
      describeImportWarning(
        '2 house-connection features were skipped because they do not affect public space.',
        i18n.t.bind(i18n),
      ),
      i18n.t('importUx.warnings.skipped', { count: 2 }),
    )
    assert.equal(
      describeImportWarning('Additional importer warning', i18n.t.bind(i18n)),
      'Additional importer warning',
    )
  }
  await i18n.changeLanguage('en')
})

test('the history query requests processed imports and mutations use CSRF', async () => {
  const requests = []
  httpClient.defaults.adapter = async (config) => {
    requests.push(config)
    return { data: saved, status: 200, statusText: 'OK', headers: {}, config }
  }
  setAntiforgeryToken('csrf-test-token')
  await api.saveMailImportSettings(model.toMailImportRequest(model.toMailImportDraft(saved)))
  await api.testMailImportConnection(
    model.toMailImportTestRequest(model.toMailImportDraft(saved), true),
  )
  await api.checkMailImportNow()
  await api.getMailImportHistory(2)
  assert.deepEqual(
    requests.map(({ method, url }) => [method, url]),
    [
      ['put', '/api/settings/mail-import'],
      ['post', '/api/settings/mail-import/test'],
      ['post', '/api/settings/mail-import/check'],
      ['get', '/api/settings/mail-import/history'],
    ],
  )
  assert.equal(JSON.parse(requests[0].data).version, 7)
  assert.equal(JSON.parse(requests[1].data).useSavedPassword, true)
  assert.deepEqual(requests[3].params, { page: 2, pageSize: 20, processedOnly: true })
  assert.ok(
    requests
      .slice(0, 3)
      .every((request) => request.headers.get('X-CSRF-TOKEN') === 'csrf-test-token'),
  )
  setAntiforgeryToken(null)
})
