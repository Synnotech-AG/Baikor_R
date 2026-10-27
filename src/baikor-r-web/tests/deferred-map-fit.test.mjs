import assert from 'node:assert/strict'
import test from 'node:test'
import View from 'ol/View.js'
import { createDeferredMapFit } from '../src/features/construction-sites/map/deferredMapFit.ts'

function mapFixture(initialSize = [0, 0]) {
  let size = initialSize
  const view = new View({ center: [100, 200], zoom: 10 })
  view.setViewportSize(size)
  const fit = createDeferredMapFit(() => ({
    updateSize() { view.setViewportSize(size) },
    getSize() { return size },
    getView() { return view },
  }))
  return { fit, view, setSize(next) { size = next } }
}

test('geometry requested on a collapsed map fits its extent once the viewport is visible', () => {
  const { fit, view, setSize } = mapFixture()
  fit.request([0, 0, 2000, 1000], { maxZoom: 18, padding: [80, 80, 80, 80] })
  assert.equal(view.getZoom(), 10, 'a hidden viewport must not fit at maximum zoom')
  assert.deepEqual(view.getCenter(), [100, 200])

  setSize([1000, 600])
  fit.flush()
  assert.deepEqual(view.getCenter(), [1000, 500])
  assert.ok(Math.abs(view.getResolution() - 2000 / 840) < 1e-9)

  view.setCenter([300, 400])
  fit.flush()
  assert.deepEqual(view.getCenter(), [300, 400], 'later resize notifications must preserve user navigation')
})

test('fit measures current viewport dimensions and waits if either dimension is zero', () => {
  const { fit, view, setSize } = mapFixture([1000, 600])
  setSize([1000, 0])
  fit.request([0, 0, 6000, 3000], { maxZoom: 18 })
  assert.equal(view.getZoom(), 10)
  setSize([1000, 600])
  fit.flush()
  assert.deepEqual(view.getCenter(), [3000, 1500])
  assert.equal(view.getResolution(), 6)
})

test('short map panels limit padding so the fitted geometry remains fully visible', () => {
  const { fit, view } = mapFixture([800, 140])
  fit.request([0, 0, 6000, 3000], { maxZoom: 18, padding: [80, 80, 80, 80] })
  assert.deepEqual(view.getCenter(), [3000, 1500])
  assert.ok(Math.abs(view.getResolution() - 3000 / 70) < 1e-9)
})

test('same-record reload preserves a deferred fit while a changed record cancels it', () => {
  const { fit, view, setSize } = mapFixture()
  fit.setContext('site-a:1')
  fit.request([0, 0, 2000, 1000], { maxZoom: 17 })
  fit.setContext('site-a:1')
  setSize([1000, 600])
  fit.flush()
  assert.deepEqual(view.getCenter(), [1000, 500])

  setSize([0, 0])
  fit.request([10000, 10000, 12000, 11000], { maxZoom: 18 })
  fit.setContext('site-b:1')
  setSize([1000, 600])
  fit.flush()
  assert.deepEqual(view.getCenter(), [1000, 500])
})

test('the latest focus request replaces older requests and clearing cancels pending focus', () => {
  const { fit, view, setSize } = mapFixture()
  fit.request([10000, 10000, 12000, 11000], { maxZoom: 18 })
  fit.request([0, 0, 6000, 3000], { maxZoom: 17 })
  setSize([1000, 600])
  fit.flush()
  assert.deepEqual(view.getCenter(), [3000, 1500])

  setSize([0, 0])
  fit.request([20000, 20000, 22000, 21000], { maxZoom: 18 })
  fit.cancel()
  setSize([1000, 600])
  fit.flush()
  assert.deepEqual(view.getCenter(), [3000, 1500])
})
