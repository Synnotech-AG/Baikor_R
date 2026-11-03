import type {
  MultiLineStringDto,
  RouteFormValues,
  RoutePathFormValues,
  RoutePathWriteRequest,
  RoutePathResponse,
} from './types'

export function routeFormIsDirty(values: RouteFormValues, original: RouteFormValues) {
  const snapshot = (form: RouteFormValues) =>
    JSON.stringify({
      title: form.title.trim(),
      description: form.description.trim(),
      paths: form.paths.map((path) => ({
        id: path.id,
        title: path.title.trim(),
        validFrom: path.validFrom || null,
        validTo: path.validTo || null,
        geometry: path.geometry,
      })),
    })
  return snapshot(values) !== snapshot(original)
}

export function createRouteDraftScope() {
  let generation = 0
  return {
    invalidate() {
      generation += 1
    },
    capture() {
      const captured = generation
      return () => captured === generation
    },
  }
}

export function createRoutePathForm(title = ''): RoutePathFormValues {
  return { key: crypto.randomUUID(), title, validFrom: '', validTo: '', geometry: null }
}

export function createRouteForm(route: RoutePathResponse | null = null): RouteFormValues {
  return {
    title: route?.title ?? '',
    description: route?.description ?? '',
    paths: route
      ? route.paths
          .filter((path) => !path.isSuppressed)
          .map((path) => ({
            key: crypto.randomUUID(),
            id: path.id,
            title: path.title,
            validFrom: path.versions[0]?.validFrom ?? '',
            validTo: path.versions[0]?.validTo ?? '',
            geometry: structuredClone(path.versions[0]?.geometry ?? null),
          }))
      : [createRoutePathForm()],
  }
}

export function routeFormIsValid(values: RouteFormValues) {
  return Boolean(
    values.title.trim() &&
    values.paths.length &&
    values.paths.every(
      (path) =>
        path.title.trim() &&
        path.geometry &&
        (!path.validFrom || !path.validTo || path.validFrom <= path.validTo),
    ),
  )
}

export function toRoutePathFocus(
  route: RoutePathResponse,
  pathId: string,
): RoutePathResponse | null {
  const path = route.paths.find((candidate) => candidate.id === pathId && !candidate.isSuppressed)
  return !route.isSuppressed && path ? { ...route, paths: [path] } : null
}

export function toRouteWriteRequest(
  values: RouteFormValues,
  version?: number,
): RoutePathWriteRequest {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    paths: values.paths.map((path) => {
      if (!path.geometry) {
        throw new Error('geometry')
      }
      return {
        ...(path.id ? { id: path.id } : {}),
        title: path.title.trim(),
        validFrom: path.validFrom || null,
        validTo: path.validTo || null,
        geometry: path.geometry,
      }
    }),
    ...(version === undefined ? {} : { version }),
  }
}

export function parseProjectedRouteGeometry(value: unknown): MultiLineStringDto {
  const document = value as {
    type?: string
    crs?: { properties?: { name?: string } }
    geometry?: unknown
    coordinates?: unknown
  }
  if (!document || document.crs?.properties?.name?.toUpperCase() !== 'EPSG:25832') {
    throw new Error('projection')
  }
  const geometry = (document.type === 'Feature' ? document.geometry : document) as {
    type?: string
    coordinates?: unknown
  }
  const lines =
    geometry?.type === 'LineString'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiLineString'
        ? geometry.coordinates
        : null
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('geometry')
  }
  for (const line of lines) {
    if (
      !Array.isArray(line) ||
      line.length < 2 ||
      !line.every(
        (point: unknown) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every(
            (coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate),
          ),
      )
    ) {
      throw new Error('geometry')
    }
    if (!line.some((point: number[]) => point[0] !== line[0][0] || point[1] !== line[0][1])) {
      throw new Error('geometry')
    }
  }
  return { type: 'MultiLineString', coordinates: lines as number[][][] }
}
