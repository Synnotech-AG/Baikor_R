import VectorImageLayer from 'ol/layer/VectorImage.js'
import type VectorSource from 'ol/source/Vector.js'
import { Stroke, Style } from 'ol/style.js'

export function createRouteNetworkLayer(source: VectorSource, color: string, visible: boolean) {
  const styles = new Map<number, Style>()
  // Cache the dense, mostly overlapping network while panning/zooming. Selected
  // paths and edit sketches stay on live vector layers in useRouteMap.
  return new VectorImageLayer({
    source,
    visible,
    zIndex: 4,
    imageRatio: 1.2,
    renderBuffer: 16,
    style: (feature, resolution) => {
      const distance = Number(feature.get('offsetMetres') ?? 0)
      const phase =
        Number.isFinite(distance) && resolution > 0
          ? (Math.round(((((distance / resolution) % 17) + 17) % 17) * 4) / 4) % 17
          : 0
      let style = styles.get(phase)
      if (!style) {
        style = new Style({
          stroke: new Stroke({ color, width: 2.5, lineDash: [10, 7], lineDashOffset: phase }),
        })
        styles.set(phase, style)
      }
      return style
    },
  })
}

/** Picking retains the original geometry/identities, independent of display merging or dash gaps. */
export function pickRouteFeature(source: VectorSource, coordinate: number[], tolerance: number) {
  if (
    coordinate.length < 2 ||
    !coordinate.slice(0, 2).every(Number.isFinite) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  ) {
    return null
  }
  const feature = source.getClosestFeatureToCoordinate(coordinate)
  const geometry = feature?.getGeometry()
  if (!geometry) {
    return null
  }
  const closest = geometry.getClosestPoint(coordinate)
  const distanceSquared = (closest[0] - coordinate[0]) ** 2 + (closest[1] - coordinate[1]) ** 2
  return distanceSquared <= tolerance ** 2 ? feature : null
}
