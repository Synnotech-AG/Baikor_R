import assert from 'node:assert/strict'
import test from 'node:test'
import { filterDe, filterEn } from '../src/shared/filters/filter-messages.ts'
import {
  alertTimelineDe,
  alertTimelineEn,
} from '../src/features/alerts/live/alert-timeline-messages.ts'
import { workspaceDe, workspaceEn } from '../src/i18n/workspace-messages.ts'
import { recordDe, recordEn } from '../src/i18n/record-messages.ts'
import { geometryDe, geometryEn } from '../src/i18n/geometry-messages.ts'
import { importDe, importEn } from '../src/i18n/import-messages.ts'
import { paneDe, paneEn } from '../src/i18n/pane-messages.ts'
import { dockingDe, dockingEn } from '../src/i18n/docking-messages.ts'
import {
  mapLayerDe,
  mapLayerEn,
} from '../src/features/construction-sites/map/map-layer-messages.ts'

for (const [name, de, en] of [
  ['filters', filterDe, filterEn],
  ['alert timeline', alertTimelineDe, alertTimelineEn],
  ['workspace', workspaceDe, workspaceEn],
  ['record', recordDe, recordEn],
  ['geometry', geometryDe, geometryEn],
  ['import', importDe, importEn],
  ['panes', paneDe, paneEn],
  ['docking', dockingDe, dockingEn],
  ['map layers', mapLayerDe, mapLayerEn],
]) {
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
