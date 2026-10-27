import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateDragPreview, floatingPanelRect, resolveDragTarget } from '../src/shared/docking/dragPreview.ts'
import { calculateGeometry } from '../src/shared/docking/geometry.ts'
import { createLayout, dockPanel, setPanelCollapsed } from '../src/shared/docking/layout.ts'

const panel = id => ({ kind: 'panel', id })
const split = (id, axis, ratio, first, second) => ({ kind: 'split', id, axis, ratio, first, second })
const defaultRoot = split('main', 'vertical', 0.6,
  split('top', 'horizontal', 0.5, panel('sites'), panel('details')), panel('map'))
const ids = ['sites', 'details', 'map']
const layout = () => createLayout(defaultRoot, ids)
const size = { width: 1010, height: 810 }
const minimums = {
  sites: { minWidth: 300, minHeight: 200 },
  details: { minWidth: 200, minHeight: 150 },
  map: { minWidth: 250, minHeight: 180 },
  history: { minWidth: 500, minHeight: 500 },
}
const edges = ['left', 'right', 'top', 'bottom']

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

test('live previews place the source at each edge with final dividers and minimum sizes', () => {
  const expected = {
    left: {
      sites: { x: 0, y: 0, width: 500, height: 810 },
      map: { x: 510, y: 0, width: 250, height: 810 },
      details: { x: 770, y: 0, width: 240, height: 810 },
    },
    right: {
      sites: { x: 0, y: 0, width: 500, height: 810 },
      details: { x: 510, y: 0, width: 240, height: 810 },
      map: { x: 760, y: 0, width: 250, height: 810 },
    },
    top: {
      sites: { x: 0, y: 0, width: 500, height: 810 },
      map: { x: 510, y: 0, width: 500, height: 400 },
      details: { x: 510, y: 410, width: 500, height: 400 },
    },
    bottom: {
      sites: { x: 0, y: 0, width: 500, height: 810 },
      details: { x: 510, y: 0, width: 500, height: 400 },
      map: { x: 510, y: 410, width: 500, height: 400 },
    },
  }
  const expectedDividers = {
    left: { x: 760, y: 0, width: 10, height: 810 },
    right: { x: 750, y: 0, width: 10, height: 810 },
    top: { x: 510, y: 400, width: 500, height: 10 },
    bottom: { x: 510, y: 400, width: 500, height: 10 },
  }
  for (const edge of edges) {
    const original = layout()
    const preview = calculateDragPreview(original, size, minimums, 'map', { panelId: 'details', edge })
    assert.deepEqual(preview.geometry.panels, expected[edge], edge)
    assert.deepEqual(preview.placeholder, expected[edge].map, edge)
    assert.deepEqual(preview.geometry.splits.map(entry => entry.rect), [
      { x: 500, y: 0, width: 10, height: 810 }, expectedDividers[edge],
    ], edge)
    assert.deepEqual(preview.geometry, calculateGeometry(dockPanel(original, 'map', 'details', edge), size, minimums), edge)
  }
})

test('nested previews keep hidden panels hidden and exactly match final constrained geometry', () => {
  const root = split('outer', 'vertical', 0.6, defaultRoot.first,
    split('lower', 'horizontal', 0.8, panel('map'), panel('history')))
  const original = setPanelCollapsed(createLayout(root, [...ids, 'history']), 'history', true)
  for (const viewport of [size, { width: 370, height: 210 }]) {
    for (const edge of edges) {
      const preview = calculateDragPreview(original, viewport, minimums, 'map', { panelId: 'details', edge })
      const committed = calculateGeometry(dockPanel(original, 'map', 'details', edge), viewport, minimums)
      assert.deepEqual(preview.geometry, committed, `${edge} ${viewport.width}`)
      assert.deepEqual(preview.placeholder, committed.panels.map)
      assert.deepEqual(Object.keys(preview.geometry.panels).sort(), ['details', 'map', 'sites'])
      assert.equal(preview.geometry.splits.length, 2)
      for (const rect of Object.values(preview.geometry.panels)) {
        assert.ok(Object.values(rect).every(value => Number.isFinite(value) && value >= 0))
        assert.ok(rect.x + rect.width <= viewport.width + 1e-9)
        assert.ok(rect.y + rect.height <= viewport.height + 1e-9)
      }
    }
  }
  assert.deepEqual(original.collapsed, ['history'])
})

test('absent, self, missing, split and malformed targets retain committed geometry', () => {
  const original = layout()
  const committed = calculateGeometry(original, size, minimums)
  for (const target of [null, { panelId: 'map', edge: 'left' }, { panelId: 'missing', edge: 'right' },
    { panelId: 'top', edge: 'top' }, { panelId: 'toString', edge: 'bottom' }, { panelId: 'details', edge: 'center' }]) {
    assert.deepEqual(calculateDragPreview(original, size, minimums, 'map', target), { geometry: committed, placeholder: null })
  }
})

test('collapsed sources or targets and unregistered sources cannot enter a live preview', () => {
  for (const [original, sourceId, targetId] of [
    [setPanelCollapsed(layout(), 'details', true), 'map', 'details'],
    [setPanelCollapsed(layout(), 'map', true), 'map', 'details'],
    [layout(), 'missing', 'details'],
    [layout(), 'top', 'details'],
    [layout(), 'toString', 'details'],
  ]) {
    assert.deepEqual(calculateDragPreview(original, size, minimums, sourceId, { panelId: targetId, edge: 'left' }), {
      geometry: calculateGeometry(original, size, minimums), placeholder: null,
    })
  }
})

test('previewing and cancelling preserve the committed tree, ratios and collapsed panels', () => {
  const original = freeze(setPanelCollapsed(layout(), 'sites', true))
  const snapshot = structuredClone(original)
  const committed = calculateGeometry(original, size, minimums)
  const target = freeze({ panelId: 'details', edge: 'left' })
  for (const edge of edges) calculateDragPreview(original, size, minimums, 'map', { ...target, edge })
  resolveDragTarget({ x: 700, y: 200 }, original, size, minimums, 'map', target)
  assert.deepEqual(calculateDragPreview(original, size, minimums, 'map', null), { geometry: committed, placeholder: null })
  assert.deepEqual(original, snapshot)
  assert.deepEqual(target, { panelId: 'details', edge: 'left' })
})

test('a pointer inside the projected source placeholder retains the previous edge', () => {
  const interiorPoints = {
    left: { x: 635, y: 405 },
    right: { x: 885, y: 405 },
    top: { x: 760, y: 200 },
    bottom: { x: 760, y: 610 },
  }
  for (const edge of edges) {
    const target = { panelId: 'details', edge }
    assert.deepEqual(resolveDragTarget(interiorPoints[edge], layout(), size, minimums, 'map', target), target, edge)
  }
})

test('a stationary pointer in the new divider keeps its advertised destination through release', () => {
  const original = layout()
  const point = { x: 80, y: 405 }
  const expected = { panelId: 'sites', edge: 'bottom' }
  let target = resolveDragTarget(point, original, size, minimums, 'map', null)
  assert.deepEqual(target, expected)
  assert.deepEqual(calculateDragPreview(original, size, minimums, 'map', target).placeholder,
    { x: 0, y: 410, width: 500, height: 400 })
  for (let move = 0; move < 4; move += 1) {
    target = resolveDragTarget(point, original, size, minimums, 'map', target)
    assert.deepEqual(target, expected)
  }
  const released = resolveDragTarget(point, original, size, minimums, 'map', target)
  assert.deepEqual(released, expected)
  assert.deepEqual(calculateDragPreview(original, size, minimums, 'map', released).geometry,
    calculateGeometry(dockPanel(original, 'map', 'sites', 'bottom'), size, minimums))
})

test('only the divider between the source placeholder and its target retains each docking edge', () => {
  const points = {
    left: { x: 765, y: 405 },
    right: { x: 755, y: 405 },
    top: { x: 760, y: 405 },
    bottom: { x: 760, y: 405 },
  }
  for (const edge of edges) {
    const target = { panelId: 'details', edge }
    assert.deepEqual(resolveDragTarget(points[edge], layout(), size, minimums, 'map', target), target, edge)
    assert.equal(resolveDragTarget({ x: 505, y: 200 }, layout(), size, minimums, 'map', target), null, edge)
  }
})

test('unequal split ratios retain the committed target when reflow moves its old edge into the interior', () => {
  const root = split('outer', 'horizontal', 0.25, panel('sites'),
    split('inner', 'vertical', 0.8, panel('details'), panel('map')))
  const original = createLayout(root, ids)
  const point = { x: 395, y: 630 }
  const expected = { panelId: 'map', edge: 'top' }
  let target = resolveDragTarget(point, original, size, minimums, 'details', null)
  assert.deepEqual(target, expected)
  for (let move = 0; move < 4; move += 1) {
    target = resolveDragTarget(point, original, size, minimums, 'details', target)
    assert.deepEqual(target, expected)
  }
  assert.deepEqual(calculateDragPreview(original, size, minimums, 'details', target).geometry,
    calculateGeometry(dockPanel(original, 'details', 'map', 'top'), size, minimums))
})

test('a stationary pointer cannot change the advertised panel when unequal horizontal splits reflow', () => {
  const root = split('outer', 'horizontal', 0.1, panel('sites'),
    split('inner', 'horizontal', 0.1, panel('details'), panel('map')))
  const original = createLayout(root, ids)
  const point = { x: 410, y: 5 }
  const target = resolveDragTarget(point, original, size, minimums, 'sites', null)
  assert.deepEqual(target, { panelId: 'details', edge: 'top' })
  assert.deepEqual(resolveDragTarget(point, original, size, minimums, 'sites', target), target)
})

test('repeated target resolution is stable across unequal ratios, prior destinations and constrained viewports', () => {
  const roots = [
    split('outer', 'horizontal', 0.25, panel('sites'), split('inner', 'vertical', 0.8, panel('details'), panel('map'))),
    split('outer', 'horizontal', 0.1, panel('sites'), split('inner', 'horizontal', 0.1, panel('details'), panel('map'))),
    split('outer', 'vertical', 0.8, panel('sites'), split('inner', 'horizontal', 0.25, panel('details'), panel('map'))),
    split('outer', 'vertical', 0.95, panel('sites'), split('inner', 'vertical', 0.73, panel('details'), panel('map'))),
  ]
  for (const root of roots) {
    const original = createLayout(root, ids)
    for (const viewport of [size, { width: 370, height: 210 }]) {
      for (const sourceId of ids) {
        const previousTargets = [null, ...ids.filter(id => id !== sourceId).flatMap(panelId => edges.map(edge => ({ panelId, edge })))]
        for (const previous of previousTargets) {
          for (let x = 5; x < viewport.width; x += 80) {
            for (let y = 5; y < viewport.height; y += 80) {
              const point = { x, y }
              const target = resolveDragTarget(point, original, viewport, minimums, sourceId, previous)
              assert.deepEqual(resolveDragTarget(point, original, viewport, minimums, sourceId, target), target,
                JSON.stringify({ axis: root.axis, ratio: root.ratio, viewport, sourceId, previous, point, target }))
            }
          }
        }
      }
    }
  }
})

test('retargeting follows a sibling at its projected position after the source leaves its branch', () => {
  const previous = { panelId: 'details', edge: 'left' }
  const point = { x: 200, y: 805 }
  assert.equal(resolveDragTarget(point, layout(), size, minimums, 'map', null), null)
  assert.deepEqual(resolveDragTarget(point, layout(), size, minimums, 'map', previous), { panelId: 'sites', edge: 'bottom' })
  assert.equal(resolveDragTarget({ x: 200, y: 200 }, layout(), size, minimums, 'map', previous), null)
})

test('a projected interior falls back to a committed edge instead of cancelling then restoring it', () => {
  const point = { x: 200, y: 405 }
  const target = resolveDragTarget(point, layout(), size, minimums, 'map', { panelId: 'details', edge: 'left' })
  assert.deepEqual(target, { panelId: 'sites', edge: 'bottom' })
  assert.deepEqual(resolveDragTarget(point, layout(), size, minimums, 'map', target), target)
})

test('an invalid previous target resolves against committed visible panels', () => {
  const point = { x: 515, y: 200 }
  for (const previous of [null, { panelId: 'missing', edge: 'left' }, { panelId: 'map', edge: 'right' },
    { panelId: 'details', edge: 'center' }]) {
    assert.deepEqual(resolveDragTarget(point, layout(), size, minimums, 'map', previous), { panelId: 'details', edge: 'left' })
  }
  const hidden = setPanelCollapsed(layout(), 'sites', true)
  assert.deepEqual(resolveDragTarget({ x: 5, y: 200 }, hidden, size, minimums, 'map', { panelId: 'sites', edge: 'right' }),
    { panelId: 'details', edge: 'left' })
})

test('leaving the canvas clears a previous destination and excludes the source from hit testing', () => {
  const previous = { panelId: 'details', edge: 'left' }
  for (const point of [{ x: -1, y: 200 }, { x: 1011, y: 200 }, { x: 200, y: -1 }, { x: 200, y: 811 }]) {
    assert.equal(resolveDragTarget(point, layout(), size, minimums, 'map', previous), null)
  }
  assert.equal(resolveDragTarget({ x: 5, y: 700 }, layout(), size, minimums, 'map', null), null)
})

test('floating panel translation preserves the pointer grab offset and original size outside the canvas', () => {
  const origin = freeze({ x: 510, y: 490, width: 500, height: 320 })
  const start = freeze({ x: 560, y: 510 })
  assert.deepEqual(floatingPanelRect(origin, start, start), origin)
  assert.deepEqual(floatingPanelRect(origin, start, { x: 635, y: 470 }), { x: 585, y: 450, width: 500, height: 320 })
  assert.deepEqual(floatingPanelRect(origin, start, { x: -10, y: -20 }), { x: -60, y: -40, width: 500, height: 320 })
  assert.deepEqual(origin, { x: 510, y: 490, width: 500, height: 320 })
  assert.deepEqual(start, { x: 560, y: 510 })
})
