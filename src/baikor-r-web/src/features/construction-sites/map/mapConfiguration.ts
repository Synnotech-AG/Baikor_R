import proj4 from 'proj4'
import { register } from 'ol/proj/proj4.js'
import { Circle, Fill, Stroke, Style } from 'ol/style.js'
import { mapTheme } from '../../../theme'

proj4.defs(
  'EPSG:25832',
  '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs',
)
register(proj4)

export const editorGeometryStyle = new Style({
  fill: new Fill({ color: mapTheme.editor.fill }),
  stroke: new Stroke({ color: mapTheme.editor.stroke, width: 3 }),
})

export const selectedGeometryStyle = new Style({
  fill: new Fill({ color: mapTheme.selected.fill }),
  stroke: new Stroke({ color: mapTheme.selected.stroke, width: 5 }),
})

export const savedGeometryStyle = new Style({
  fill: new Fill({ color: mapTheme.saved.fill }),
  stroke: new Stroke({ color: mapTheme.saved.stroke, width: 2 }),
})

export const addressMarkerStyle = new Style({
  image: new Circle({
    radius: 8,
    fill: new Fill({ color: mapTheme.marker.fill }),
    stroke: new Stroke({ color: mapTheme.marker.stroke, width: 3 }),
  }),
})
