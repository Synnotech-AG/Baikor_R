import type { MultiLineStringDto, RoutePathResponse } from './types'

function extentOfCoordinates(coordinates: number[][]) {
  const valid = coordinates.filter(
    (point) => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]),
  )
  if (valid.length === 0) {
    return null
  }
  return valid.reduce(
    (extent, point) => [
      Math.min(extent[0], point[0]),
      Math.min(extent[1], point[1]),
      Math.max(extent[2], point[0]),
      Math.max(extent[3], point[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
}

export function routeLineGeometries(
  route: Pick<RoutePathResponse, 'isSuppressed' | 'paths'>,
): MultiLineStringDto[] {
  return route.isSuppressed
    ? []
    : route.paths
        .filter((path) => !path.isSuppressed)
        .flatMap((path) =>
          path.versions.map((version) => ({
            type: 'MultiLineString',
            coordinates: version.geometry.coordinates.map((line) =>
              line.map((point) => [...point]),
            ),
          })),
        )
}

export function routeFocusExtent(route: Pick<RoutePathResponse, 'isSuppressed' | 'paths'>) {
  return extentOfCoordinates(
    routeLineGeometries(route).flatMap((geometry) => geometry.coordinates.flat()),
  )
}

export function canFinishRouteSketch(coordinates: number[][]) {
  const placed = coordinates.slice(0, -1)
  return (
    placed.length >= 2 &&
    placed.every(
      (point) => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]),
    ) &&
    placed.some((point) => point[0] !== placed[0][0] || point[1] !== placed[0][1])
  )
}

export function toDrawnRouteGeometry(coordinates: number[][]): MultiLineStringDto {
  if (!canFinishRouteSketch([...coordinates, coordinates.at(-1) ?? []])) {
    throw new Error('geometry')
  }
  return {
    type: 'MultiLineString',
    coordinates: [coordinates.map((point) => [point[0], point[1]])],
  }
}
