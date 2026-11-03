import assert from 'node:assert/strict'
import test from 'node:test'
import VectorImageLayer from 'ol/layer/VectorImage.js'
import VectorSource from 'ol/source/Vector.js'
import Feature from 'ol/Feature.js'
import MultiLineString from 'ol/geom/MultiLineString.js'
import {
  createRouteNetworkLayer,
  pickRouteFeature,
} from '../src/features/routes/route-map-layer.ts'

test('background routes use a cached single-stroke image while retaining selectable vector geometry', () => {
  const feature = new Feature({
    geometry: new MultiLineString([
      [
        [0, 0],
        [10, 20],
      ],
    ]),
    routeId: 'parent',
    pathId: 'path',
  })
  const source = new VectorSource({ features: [feature] })
  const layer = createRouteNetworkLayer(source, '#8b2412', false)
  assert.ok(layer instanceof VectorImageLayer)
  assert.equal(layer.getSource(), source)
  assert.equal(layer.getVisible(), false)
  assert.equal(layer.getSource().getFeatures()[0].get('pathId'), 'path')
  const styles = layer.getStyleFunction()(feature, 1)
  const strokes = Array.isArray(styles) ? styles : [styles]
  assert.equal(strokes.length, 1, 'The dense network must not stroke every shared road twice')
  assert.equal(strokes[0].getStroke().getColor(), '#8b2412')
  assert.ok(strokes[0].getStroke().getLineDash().length > 0)
  layer.setVisible(true)
  assert.equal(layer.getVisible(), true)
  assert.deepEqual(feature.getGeometry().getCoordinates(), [
    [
      [0, 0],
      [10, 20],
    ],
  ])
})

test('retained network runs continue the dash phase at the current map resolution', () => {
  const feature = new Feature({
    geometry: new MultiLineString([
      [
        [0, 0],
        [100, 0],
      ],
    ]),
    offsetMetres: 26,
  })
  const layer = createRouteNetworkLayer(new VectorSource({ features: [feature] }), '#8b2412', true)
  const styleAt = (resolution) => layer.getStyleFunction()(feature, resolution).getStroke()
  assert.equal(styleAt(2).getLineDashOffset(), 13)
  assert.equal(styleAt(4).getLineDashOffset(), 6.5)
  assert.equal(styleAt(2).getWidth(), 2.5)
  assert.deepEqual(styleAt(2).getLineDash(), [10, 7])
})

test('map picking uses original route/path identities even in display dash gaps', () => {
  const feature = new Feature({
    geometry: new MultiLineString([
      [
        [0, 0],
        [100, 0],
      ],
    ]),
    routeId: 'route',
    pathId: 'path',
  })
  const source = new VectorSource({ features: [feature] })
  assert.equal(pickRouteFeature(source, [15, 3], 6), feature)
  assert.equal(pickRouteFeature(source, [15, 6], 6).get('pathId'), 'path')
  assert.equal(pickRouteFeature(source, [15, 7], 6), null)
  assert.equal(pickRouteFeature(new VectorSource(), [0, 0], 6), null)
  assert.equal(pickRouteFeature(source, [NaN, 0], 6), null)
})
