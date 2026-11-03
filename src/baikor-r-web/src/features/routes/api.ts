import { httpClient } from '../../api/http-client'
import { useEndpoint } from '../../api/use-endpoint'
import type {
  PagedRoutes,
  RouteImportResult,
  RoutePathResponse,
  RoutePathWriteRequest,
} from './types'

export async function getRoutes(
  query: { search?: string; page?: number; pageSize?: number; includeSuppressed?: boolean } = {},
  signal?: AbortSignal,
) {
  return (await httpClient.get<PagedRoutes>('/api/routes', { params: query, signal })).data
}

export async function getRoute(id: string, signal?: AbortSignal, includeSuppressed = false) {
  return (
    await httpClient.get<RoutePathResponse>(`/api/routes/${encodeURIComponent(id)}`, {
      signal,
      params: { includeSuppressed },
    })
  ).data
}

export function useRestoreRouteEndpoint() {
  return useEndpoint(
    async (id: string, version: number) =>
      (
        await httpClient.post<RoutePathResponse>(`/api/routes/${encodeURIComponent(id)}/restore`, {
          version,
        })
      ).data,
  )
}

export function useRestoreRoutePathEndpoint() {
  return useEndpoint(
    async (routeId: string, pathId: string, version: number) =>
      (
        await httpClient.post<RoutePathResponse>(
          `/api/routes/${encodeURIComponent(routeId)}/paths/${encodeURIComponent(pathId)}/restore`,
          { version },
        )
      ).data,
  )
}

export function useSaveRouteEndpoint() {
  return useEndpoint(async (id: string | null, request: RoutePathWriteRequest) =>
    id
      ? (await httpClient.put<RoutePathResponse>(`/api/routes/${encodeURIComponent(id)}`, request))
          .data
      : (await httpClient.post<RoutePathResponse>('/api/routes', request)).data,
  )
}

export function useDeleteRouteEndpoint() {
  return useEndpoint(async (id: string) => {
    await httpClient.delete(`/api/routes/${encodeURIComponent(id)}`)
  })
}

export function useDeleteRoutePathEndpoint() {
  return useEndpoint(
    async (routeId: string, pathId: string, version: number) =>
      (
        await httpClient.delete<RoutePathResponse>(
          `/api/routes/${encodeURIComponent(routeId)}/paths/${encodeURIComponent(pathId)}`,
          { data: { version } },
        )
      ).data,
  )
}

export function useImportRoutesEndpoint() {
  return useEndpoint(async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return (
      await httpClient.post<RouteImportResult>('/api/routes/imports/gtfs', form, {
        headers: { 'Content-Type': undefined },
      })
    ).data
  })
}
