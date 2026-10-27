import assert from 'node:assert/strict'
import test from 'node:test'
import { workspaceDe, workspaceEn } from '../src/i18n/workspaceMessages.ts'
import { recordDe, recordEn } from '../src/i18n/recordMessages.ts'
import { geometryDe, geometryEn } from '../src/i18n/geometryMessages.ts'
import { importDe, importEn } from '../src/i18n/importMessages.ts'
import { paneDe, paneEn } from '../src/i18n/paneMessages.ts'
import { dockingDe, dockingEn } from '../src/i18n/dockingMessages.ts'

for (const [name, de, en] of [['workspace', workspaceDe, workspaceEn], ['record', recordDe, recordEn], ['geometry', geometryDe, geometryEn], ['import', importDe, importEn], ['panes', paneDe, paneEn], ['docking', dockingDe, dockingEn]]) {
  test(`${name} messages resolve in both languages with flat-key i18n configuration`, () => {
    assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort())
    for (const dictionary of [de, en]) {
      for (const [key, value] of Object.entries(dictionary)) {
        assert.equal(typeof value, 'string', `${key} must be a flat translation string`)
        assert.ok(value.trim(), `${key} must not be empty`)
      }
    }
  })
}
