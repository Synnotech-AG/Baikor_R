import proj4 from 'proj4'
import { register } from 'ol/proj/proj4.js'
import { Circle, Fill, Stroke, Style } from 'ol/style.js'

proj4.defs(
  'EPSG:25832',
  '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs',
)
register(proj4)

export const editorGeometryStyle = new Style({
  fill: new Fill({ color: 'rgba(208, 73, 52, 0.24)' }),
  stroke: new Stroke({ color: '#c23b2a', width: 3 }),
})

export const selectedGeometryStyle = new Style({
  fill: new Fill({ color: 'rgba(200, 214, 62, 0.30)' }),
  stroke: new Stroke({ color: '#e2b600', width: 5 }),
})

export const savedGeometryStyle = new Style({
  fill: new Fill({ color: 'rgba(34, 109, 134, 0.22)' }),
  stroke: new Stroke({ color: '#176d85', width: 2 }),
})

export const addressMarkerStyle = new Style({
  image: new Circle({
    radius: 8,
    fill: new Fill({ color: '#c23b2a' }),
    stroke: new Stroke({ color: '#fff', width: 3 }),
  }),
})
