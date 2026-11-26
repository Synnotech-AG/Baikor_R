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
let MailImportControls
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
  ;({ MailImportControls, MailImportHistory } = await server.ssrLoadModule(
    '/src/features/import/mail-import-controls.tsx',
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

test('admin controls are hidden from other roles and all mutations wait for CSRF readiness', () => {
  const props = {
    canAdmin: true,
    ready: true,
    busy: false,
    settings: saved,
    status: { enabled: false, state: 'paused', pendingCount: 0 },
    onSettings: noop,
    onCheck: noop,
    onToggle: noop,
    onReset: noop,
  }
  assert.equal(render(MailImportControls, { ...props, canAdmin: false }), '')
  assert.equal(
    buttons(render(MailImportControls, props)).find(
      (button) => button.name === i18n.t('mailImport.resume'),
    )?.disabled,
    false,
  )
  const waiting = buttons(render(MailImportControls, { ...props, ready: false }))
  assert.ok(waiting.length > 0)
  assert.ok(waiting.every((button) => button.disabled))
  assert.equal(
    buttons(
      render(MailImportControls, { ...props, settings: { ...saved, encryptionConfigured: false } }),
    ).find((button) => button.name === i18n.t('mailImport.resume'))?.disabled,
    true,
  )
  const active = buttons(
    render(MailImportControls, {
      ...props,
      settings: { ...saved, enabled: true },
      status: { enabled: true, state: 'idle', pendingCount: 0 },
    }),
  )
  assert.equal(
    active.find((button) => button.name === i18n.t('mailImport.checkNow'))?.disabled,
    false,
  )
  assert.equal(active.find((button) => button.name === i18n.t('mailImport.pause'))?.disabled, false)
})

test('history escapes filenames and only eligible failures offer retry', () => {
  const row = {
    id: '1',
    fileName: '<img src=x onerror=alert(1)>.zip',
    state: 'failed',
    createdAt: '2026-11-26T10:00:00Z',
    completedAt: null,
    createdCount: 0,
    warnings: [],
    errorKey: 'mailImports.sourceMissing',
    attempts: 1,
    canRetry: true,
  }
  const props = {
    history: { items: [row], page: 1, pageSize: 20, totalCount: 1 },
    ready: true,
    busy: false,
    onPage: noop,
    onRetry: noop,
  }
  const html = render(MailImportHistory, props)
  assert.ok(html.includes('&lt;img'))
  assert.equal(html.includes('<img src=x'), false)
  assert.equal(
    buttons(html).filter((button) => button.name === i18n.t('mailImport.retry')).length,
    1,
  )
  const done = render(MailImportHistory, {
    ...props,
    history: { ...props.history, items: [{ ...row, state: 'imported', canRetry: false }] },
  })
  assert.equal(
    buttons(done).filter((button) => button.name === i18n.t('mailImport.retry')).length,
    0,
  )
  const ignored = render(MailImportHistory, {
    ...props,
    history: {
      ...props.history,
      items: [{ ...row, state: 'ignored', fileName: '', canRetry: false }],
    },
  })
  assert.ok(ignored.includes(i18n.t('mailImport.noZipAttachment')))
})

test('saved passwords never populate the settings field and active mailbox identity fields stay locked', () => {
  const props = {
    draft: model.toMailImportDraft({ ...saved, enabled: true }),
    saved: { ...saved, enabled: true },
    ready: true,
    busy: false,
    onChange: noop,
    onSave: noop,
    onTest: noop,
  }
  const html = render(MailImportSettingsForm, props)
  assert.ok(html.includes(i18n.t('mailImport.passwordSaved')))
  assert.match(html, /<input[^>]*id="mail-import-password"[^>]*value=""/)
  for (const id of ['host', 'port', 'username', 'folder']) {
    const input = [...html.matchAll(/<input\b[^>]*>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes(`id="mail-import-${id}"`))
    assert.match(input, /disabled/)
  }
  const locked = buttons(render(MailImportSettingsForm, { ...props, ready: false }))
  assert.ok(locked.every((button) => button.disabled))
})

test('retrying work and actionable backend errors resolve in both languages', async () => {
  for (const language of ['de', 'en']) {
    await i18n.changeLanguage(language)
    for (const key of [
      'mailImport.state.retry',
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

test('mail history translates existing importer warnings and preserves unknown warning text safely', async () => {
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

test('API controls use shared CSRF client and encode retry identities without leaking read-only settings', async () => {
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
  await api.retryMailImport('attachment/one ?')
  assert.deepEqual(
    requests.map(({ method, url }) => [method, url]),
    [
      ['put', '/api/settings/mail-import'],
      ['post', '/api/settings/mail-import/test'],
      ['post', '/api/settings/mail-import/check'],
      ['post', '/api/settings/mail-import/history/attachment%2Fone%20%3F/retry'],
    ],
  )
  assert.equal(JSON.parse(requests[0].data).version, 7)
  assert.equal(JSON.parse(requests[1].data).useSavedPassword, true)
  assert.ok(requests.every((request) => request.headers.get('X-CSRF-TOKEN') === 'csrf-test-token'))
  setAntiforgeryToken(null)
})
