import assert from 'node:assert/strict'
import test from 'node:test'
import { createLayout, dockPanel, normalizeLayout, setPanelCollapsed, setSplitRatio } from '../src/shared/docking/layout.ts'
import { calculateGeometry } from '../src/shared/docking/geometry.ts'
import { readLayout, saveLayout } from '../src/shared/docking/layoutStorage.ts'

const panel = id => ({ kind: 'panel', id })
const split = (id, axis, ratio, first, second) => ({ kind: 'split', id, axis, ratio, first, second })
const defaultRoot = split('main', 'vertical', 0.6,
  split('top', 'horizontal', 0.5, panel('sites'), panel('details')), panel('map'))
const ids = ['sites', 'details', 'map']
const layout = () => createLayout(defaultRoot, ids)
const leafIds = node => !node ? [] : node.kind === 'panel' ? [node.id] : [...leafIds(node.first), ...leafIds(node.second)]

test('edge docking removes the source, collapses its former branch and nests beside its target', () => {
  const original = layout()
  const snapshot = structuredClone(original)
  const moved = dockPanel(original, 'map', 'details', 'left')
  assert.equal(moved.root.id, 'top')
  assert.equal(moved.root.first.id, 'sites')
  assert.equal(moved.root.second.axis, 'horizontal')
  assert.deepEqual(leafIds(moved.root.second), ['map', 'details'])
  assert.equal(moved.root.second.ratio, 0.5)
  assert.deepEqual(original, snapshot)
  assert.deepEqual(leafIds(moved.root).sort(), [...ids].sort())
})

test('all docking edges set direction and panel order for arbitrary nested targets', () => {
  for (const [edge, axis, order] of [
    ['left', 'horizontal', ['map', 'details']],
    ['right', 'horizontal', ['details', 'map']],
    ['top', 'vertical', ['map', 'details']],
    ['bottom', 'vertical', ['details', 'map']],
  ]) {
    const moved = dockPanel(layout(), 'map', 'details', edge)
    assert.equal(moved.root.second.axis, axis)
    assert.deepEqual(leafIds(moved.root.second), order)
  }
})

test('self drops and unknown panel or split IDs leave the same layout untouched', () => {
  const original = layout()
  assert.equal(dockPanel(original, 'sites', 'sites', 'right'), original)
  assert.equal(dockPanel(original, 'missing', 'sites', 'right'), original)
  assert.equal(dockPanel(original, 'sites', 'missing', 'right'), original)
  assert.equal(setPanelCollapsed(original, 'missing', true), original)
  assert.equal(setSplitRatio(original, 'missing', 0.7), original)
  for (const ratio of [0, 1, -1, NaN, Infinity]) assert.equal(setSplitRatio(original, 'main', ratio), original)
})

test('collapse retains leaves and ratios so every panel can restore its prior place', () => {
  const original = setSplitRatio(layout(), 'top', 0.73)
  let hidden = original
  for (const id of ids) hidden = setPanelCollapsed(hidden, id, true)
  assert.equal(hidden.root, original.root)
  assert.deepEqual(hidden.collapsed, ids)
  assert.deepEqual(original.collapsed, [])
  for (const id of ids) hidden = setPanelCollapsed(hidden, id, false)
  assert.deepEqual(hidden, original)
  assert.equal(setPanelCollapsed(original, 'sites', false), original)
})

test('moving a hidden panel reveals it without losing another hidden panel', () => {
  let hidden = setPanelCollapsed(layout(), 'details', true)
  hidden = setPanelCollapsed(hidden, 'map', true)
  const moved = dockPanel(hidden, 'map', 'sites', 'bottom')
  assert.deepEqual(moved.collapsed, ['details'])
  assert.deepEqual(leafIds(moved.root).sort(), [...ids].sort())
})

test('registry reconciliation prunes removed and duplicate panels and appends new panels', () => {
  const stored = { version: 1, root: split('saved', 'horizontal', 0.3,
    panel('removed'), split('inner', 'vertical', 0.7, panel('map'), panel('map'))),
  collapsed: ['removed', 'map', 'map'] }
  const restored = normalizeLayout(stored, defaultRoot, [...ids, 'history'])
  assert.deepEqual(leafIds(restored.root), ['map', 'sites', 'details', 'history'])
  assert.deepEqual(restored.collapsed, ['map'])
  assert.deepEqual(leafIds(stored.root), ['removed', 'map', 'map'])
  assert.deepEqual(createLayout(null, []), { version: 1, root: null, collapsed: [] })
})

test('large registries retain reconciled panel arrangements on subsequent normalization', () => {
  const registry = Array.from({ length: 250 }, (_, index) => `panel-${index}`)
  const original = dockPanel(createLayout(panel('panel-0'), registry), 'panel-249', 'panel-0', 'bottom')
  const restored = normalizeLayout(original, panel('panel-0'), registry)
  assert.equal(restored.root.id, original.root.id)
  assert.deepEqual(restored, original)
})

test('invalid versions, nodes, ratios and duplicate split IDs recover the default layout', () => {
  const original = layout()
  const malformed = [null, {}, { ...original, version: 2 }, { ...original, collapsed: 'map' },
    { ...original, root: { kind: 'wat', id: 'map' } },
    { ...original, root: { ...defaultRoot, ratio: Infinity } },
    { ...original, root: { ...defaultRoot, first: { ...defaultRoot.first, id: 'main' } } },
    { ...original, root: { ...defaultRoot, second: null } }]
  for (const value of malformed) assert.deepEqual(normalizeLayout(value, defaultRoot, ids), original)
})

test('valid extreme split ratios remain exact when saved and loaded', () => {
  for (const ratio of [0.0001, 0.095, 0.92, 0.9999]) {
    const changed = setSplitRatio(layout(), 'top', ratio)
    let value = null
    const storage = { getItem(key) { assert.equal(key, 'workspace'); return value }, setItem(key, next) { assert.equal(key, 'workspace'); value = next } }
    saveLayout('workspace', changed, storage)
    assert.equal(readLayout('workspace', defaultRoot, ids, storage).root.first.ratio, ratio)
  }
})

test('missing, corrupt and blocked storage safely falls back and blocked writes are harmless', () => {
  const original = layout()
  for (const value of [null, 'bad json', 'null', '{"version":1,"root":null,"collapsed":[]}']) {
    const restored = readLayout('workspace', defaultRoot, ids, { getItem() { return value } })
    assert.deepEqual(leafIds(restored.root).sort(), [...ids].sort())
  }
  assert.deepEqual(readLayout('workspace', defaultRoot, ids, { getItem() { throw Error('denied') } }), original)
  assert.deepEqual(readLayout('workspace', defaultRoot, ids), original)
  assert.doesNotThrow(() => saveLayout('workspace', original, { setItem() { throw Error('quota') } }))
  assert.doesNotThrow(() => saveLayout('workspace', original))
})

const minimums = { sites: { minWidth: 300, minHeight: 200 }, details: { minWidth: 200, minHeight: 150 }, map: { minWidth: 250, minHeight: 180 } }

test('recursive geometry uses absolute rectangles and reserves each divider exactly once', () => {
  const result = calculateGeometry(layout(), { width: 1010, height: 810 }, minimums)
  assert.deepEqual(result.panels.sites, { x: 0, y: 0, width: 500, height: 480 })
  assert.deepEqual(result.panels.details, { x: 510, y: 0, width: 500, height: 480 })
  assert.deepEqual(result.panels.map, { x: 0, y: 490, width: 1010, height: 320 })
  assert.deepEqual(result.splits.find(s => s.id === 'main').rect, { x: 0, y: 480, width: 1010, height: 10 })
  assert.deepEqual(result.splits.find(s => s.id === 'top').rect, { x: 500, y: 0, width: 10, height: 480 })
  assert.equal(result.splits.find(s => s.id === 'main').available, 800)
})

test('nested subtree minimums constrain resizing along both axes without overwriting stored ratios', () => {
  const original = setSplitRatio(setSplitRatio(layout(), 'top', 0.01), 'main', 0.99)
  const result = calculateGeometry(original, { width: 1010, height: 810 }, minimums)
  const top = result.splits.find(s => s.id === 'top')
  const main = result.splits.find(s => s.id === 'main')
  assert.equal(top.minRatio, 0.3)
  assert.equal(top.maxRatio, 0.8)
  assert.equal(top.ratio, 0.3)
  assert.equal(main.minRatio, 0.25)
  assert.equal(main.maxRatio, 0.775)
  assert.equal(main.ratio, 0.775)
  assert.equal(result.panels.map.height, 180)
  assert.equal(original.root.ratio, 0.99)
  assert.equal(original.root.first.ratio, 0.01)
})

test('a horizontal subtree contributes both child widths and its divider to ancestor minimums', () => {
  const root = split('outer', 'horizontal', 0.01, defaultRoot.first, panel('map'))
  const result = calculateGeometry(createLayout(root, ids), { width: 1010, height: 600 }, minimums)
  assert.equal(result.splits.find(s => s.id === 'outer').minRatio, 0.51)
  assert.equal(result.panels.sites.width, 300)
  assert.equal(result.panels.details.width, 200)
})

test('hidden branches remove separators and let visible siblings occupy the available area', () => {
  let hidden = setPanelCollapsed(layout(), 'sites', true)
  let result = calculateGeometry(hidden, { width: 1010, height: 810 }, minimums)
  assert.deepEqual(Object.keys(result.panels).sort(), ['details', 'map'])
  assert.deepEqual(result.panels.details, { x: 0, y: 0, width: 1010, height: 480 })
  assert.deepEqual(result.splits.map(s => s.id), ['main'])
  hidden = setPanelCollapsed(hidden, 'details', true)
  result = calculateGeometry(hidden, { width: 1010, height: 810 }, minimums)
  assert.deepEqual(result.panels.map, { x: 0, y: 0, width: 1010, height: 810 })
  assert.equal(result.splits.length, 0)
  hidden = setPanelCollapsed(hidden, 'map', true)
  result = calculateGeometry(hidden, { width: 1010, height: 810 }, minimums)
  assert.deepEqual(Object.keys(result.panels), [])
  assert.equal(result.splits.length, 0)
})

test('tiny and invalid viewport sizes produce finite contained rectangles and ordered bounds', () => {
  for (const size of [{ width: 80, height: 60 }, { width: 1, height: 1 }, { width: 0, height: 0 }, { width: NaN, height: -1 }]) {
    const result = calculateGeometry(layout(), size, minimums)
    for (const rect of [...Object.values(result.panels), ...result.splits.map(s => s.rect)]) {
      for (const value of Object.values(rect)) assert.ok(Number.isFinite(value) && value >= 0)
      assert.ok(rect.x + rect.width <= Math.max(0, size.width || 0) + 1e-9)
      assert.ok(rect.y + rect.height <= Math.max(0, size.height || 0) + 1e-9)
    }
    for (const s of result.splits) {
      assert.ok(s.minRatio <= s.ratio && s.ratio <= s.maxRatio)
      assert.ok(s.minRatio >= 0 && s.maxRatio <= 1)
    }
  }
})

test('oversized finite panel minima cannot overflow recursive geometry calculations', () => {
  const huge = Object.fromEntries(ids.map(id => [id, { minWidth: Number.MAX_VALUE, minHeight: Number.MAX_VALUE }]))
  const root = split('outer', 'horizontal', 0.5, defaultRoot.first, panel('map'))
  const result = calculateGeometry(createLayout(root, ids), { width: 100, height: 100 }, huge)
  for (const rect of Object.values(result.panels)) {
    assert.ok(Object.values(rect).every(value => Number.isFinite(value) && value >= 0))
  }
  for (const s of result.splits) assert.ok(Number.isFinite(s.ratio) && s.minRatio <= s.ratio && s.ratio <= s.maxRatio)
})
