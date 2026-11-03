import assert from 'node:assert/strict'
import test from 'node:test'
import { readLayout } from '../src/shared/docking/layout-storage.ts'
import { mergeConstructionSitePanels } from '../src/features/construction-sites/site-dock-layout.ts'

test('saved layouts can be migrated before obsolete panels are normalized away', () => {
  const root = { kind: 'panel', id: 'details' }
  const storage = { getItem: () => JSON.stringify({ version: 1, root, collapsed: [] }) }
  let migrated = false
  const layout = readLayout(
    'sites',
    { kind: 'panel', id: 'sites' },
    ['sites'],
    storage,
    [],
    (saved) => {
      migrated = true
      return { ...saved, root: { kind: 'panel', id: 'sites' } }
    },
  )
  assert.equal(migrated, true)
  assert.deepEqual(layout.root, { kind: 'panel', id: 'sites' })
})

for (const [collapsed, expectedPosition, expectedCollapsed] of [
  [[], 'sites-position', []],
  [['sites'], 'details-position', []],
  [['details'], 'sites-position', []],
  [['sites', 'details', 'routes'], 'sites-position', ['routes', 'sites']],
]) {
  test(`merging the site panels preserves visibility and other dock branches (${collapsed.join(',')})`, () => {
    const panel = (id) => ({ kind: 'panel', id })
    const root = {
      kind: 'split',
      id: 'all',
      axis: 'horizontal',
      ratio: 0.6,
      first: {
        kind: 'split',
        id: 'sites-position',
        axis: 'vertical',
        ratio: 0.4,
        first: panel('sites'),
        second: panel('map'),
      },
      second: {
        kind: 'split',
        id: 'details-position',
        axis: 'vertical',
        ratio: 0.7,
        first: panel('details'),
        second: panel('routes'),
      },
    }
    const before = { version: 1, root, collapsed }
    const copy = structuredClone(before)
    const result = mergeConstructionSitePanels(before)
    assert.deepEqual(result.collapsed, expectedCollapsed)
    assert.equal(result.root.ratio, 0.6)
    const branch = expectedPosition === 'sites-position' ? result.root.first : result.root.second
    assert.equal(branch.id, expectedPosition)
    assert.equal(branch.first.id, 'sites')
    assert.deepEqual(before, copy)
    assert.deepEqual(mergeConstructionSitePanels(result), result)
  })
}
