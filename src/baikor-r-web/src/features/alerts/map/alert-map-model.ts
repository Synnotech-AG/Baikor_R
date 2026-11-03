import type { AlertDetails } from '../types'

function extentOfCoordinates(coordinates: number[][]): number[] | null {
  const valid = coordinates.filter(
    (point) => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]),
  )
  if (!valid.length) {
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

export function alertFocusExtent(
  alert: Pick<AlertDetails, 'location' | 'details' | 'focusEnvelope'>,
) {
  const envelope = alert.focusEnvelope
  if (
    envelope?.length === 4 &&
    envelope.every(Number.isFinite) &&
    envelope[0] <= envelope[2] &&
    envelope[1] <= envelope[3]
  ) {
    return [...envelope]
  }
  const siteCoordinates =
    alert.details?.siteGeometries?.flatMap((geometry) => geometry.coordinates.flat()) ?? []
  if (siteCoordinates.length) {
    return extentOfCoordinates(siteCoordinates)
  }
  if (alert.location) {
    return extentOfCoordinates([alert.location.coordinates])
  }
  return (
    extentOfCoordinates(alert.details?.routeGeometry?.coordinates.flat() ?? []) ??
    extentOfCoordinates(
      alert.details?.paths?.flatMap((path) => path.geometry?.coordinates.flat() ?? []) ?? [],
    )
  )
}
