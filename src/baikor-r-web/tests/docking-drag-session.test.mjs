import assert from 'node:assert/strict'
import test from 'node:test'
import { advancePanelDrag, consumeDragEscape } from '../src/shared/docking/dragSession.ts'

const session = (changes = {}) => ({
  sourceId: 'map',
  origin: { x: 20, y: 40, width: 400, height: 300 },
  start: { x: 120, y: 60 },
  point: { x: 120, y: 60 },
  pointerId: 7,
  started: false,
  target: null,
  ...changes,
})

test('another pointer cannot start or change the active drag session', () => {
  for (const drag of [session(), session({ started: true, target: { panelId: 'sites', edge: 'right' } })]) {
    const next = advancePanelDrag(drag, { x: 800, y: 600 }, 8, () => {
      assert.fail('another pointer must not resolve or replace the active destination')
    })
    assert.equal(next, drag)
  }
})

test('movement below the grab threshold keeps the panel in its committed position', () => {
  const drag = session()
  for (const point of [{ x: 127.99, y: 60 }, { x: 125, y: 66 }]) {
    assert.equal(advancePanelDrag(drag, point, 7, () => {
      assert.fail('a click or slight pointer movement must not create a destination')
    }), drag)
  }
})

test('the exact threshold starts dragging and retains the original grab rectangle and offset', () => {
  const drag = session()
  const target = { panelId: 'sites', edge: 'left' }
  const next = advancePanelDrag(drag, { x: 128, y: 60 }, 7, (point, sourceId, previous) => {
    assert.deepEqual(point, { x: 128, y: 60 })
    assert.equal(sourceId, 'map')
    assert.equal(previous, null)
    return target
  })
  assert.deepEqual(next, { ...drag, point: { x: 128, y: 60 }, started: true, target })
  assert.equal(next.origin, drag.origin)
  assert.equal(next.start, drag.start)
  assert.deepEqual(drag.point, { x: 120, y: 60 })
  assert.equal(drag.started, false)
})

test('diagonal movement uses distance from the grab origin to cross the threshold', () => {
  const next = advancePanelDrag(session(), { x: 126, y: 66 }, 7, () => null)
  assert.equal(next.started, true)
  assert.deepEqual(next.point, { x: 126, y: 66 })
})

test('a started drag stays active at the grab origin and supplies its prior destination', () => {
  const target = { panelId: 'details', edge: 'bottom' }
  const drag = session({ point: { x: 900, y: 500 }, started: true, target })
  const next = advancePanelDrag(drag, { x: 120, y: 60 }, 7, (point, sourceId, previous) => {
    assert.deepEqual(point, { x: 120, y: 60 })
    assert.equal(sourceId, 'map')
    assert.equal(previous, target)
    return null
  })
  assert.equal(next.started, true)
  assert.equal(next.target, null)
  assert.deepEqual(next.point, drag.start)
  assert.equal(drag.target, target)
})

test('the release coordinates replace the last hover destination before committing a drop', () => {
  const resolve = (point) => point.x < 500
    ? { panelId: 'sites', edge: 'right' }
    : { panelId: 'details', edge: 'top' }
  const hover = advancePanelDrag(session(), { x: 300, y: 100 }, 7, resolve)
  assert.deepEqual(hover.target, { panelId: 'sites', edge: 'right' })
  const release = advancePanelDrag(hover, { x: 800, y: 120 }, 7, resolve)
  assert.deepEqual(release.target, { panelId: 'details', edge: 'top' })
  assert.deepEqual(release.point, { x: 800, y: 120 })
})

test('releasing outside all destinations clears the hover destination', () => {
  const hover = session({ started: true, target: { panelId: 'sites', edge: 'left' } })
  const release = advancePanelDrag(hover, { x: -20, y: 100 }, 7, () => null)
  assert.equal(release.target, null)
  assert.deepEqual(release.point, { x: -20, y: 100 })
})

const keyEvent = (key) => Object.assign(new Event('keydown', { cancelable: true }), { key })

test('Escape cancels docking before a competing drawing listener can discard a map sketch', () => {
  const target = new EventTarget()
  let cancellations = 0
  let drawingCancellations = 0
  target.addEventListener('keydown', event => consumeDragEscape(event, () => {
    assert.equal(event.defaultPrevented, true)
    cancellations += 1
  }))
  target.addEventListener('keydown', () => { drawingCancellations += 1 })
  const event = keyEvent('Escape')
  assert.equal(target.dispatchEvent(event), false)
  assert.equal(cancellations, 1)
  assert.equal(drawingCancellations, 0)
})

test('other keys keep propagating and do not cancel docking', () => {
  const target = new EventTarget()
  let cancellations = 0
  let laterListeners = 0
  target.addEventListener('keydown', event => consumeDragEscape(event, () => { cancellations += 1 }))
  target.addEventListener('keydown', () => { laterListeners += 1 })
  const event = keyEvent('Enter')
  assert.equal(target.dispatchEvent(event), true)
  assert.equal(event.defaultPrevented, false)
  assert.equal(cancellations, 0)
  assert.equal(laterListeners, 1)
})
