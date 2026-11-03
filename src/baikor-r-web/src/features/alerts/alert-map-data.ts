import type { AlertSummary, DetectionStatus, PagedAlerts } from './types'

export async function loadWorkspaceAlerts(
  fetchPage: (page: number, signal?: AbortSignal) => Promise<PagedAlerts>,
  signal?: AbortSignal,
): Promise<AlertSummary[]> {
  const loaded = new Map<string, AlertSummary>()
  const paginationError = 'The alert list changed while loading. Retry the request.'
  let expectedCount: number | undefined
  let expectedPageSize: number | undefined
  let pageCount = 1
  for (let page = 1; page <= pageCount; page += 1) {
    signal?.throwIfAborted()
    const response = await fetchPage(page, signal)
    signal?.throwIfAborted()
    if (
      response.page !== page ||
      !Number.isSafeInteger(response.totalCount) ||
      response.totalCount < 0 ||
      !Number.isSafeInteger(response.pageSize) ||
      response.pageSize < 1 ||
      response.items.length > response.pageSize ||
      (expectedCount !== undefined && response.totalCount !== expectedCount) ||
      (expectedPageSize !== undefined && response.pageSize !== expectedPageSize) ||
      (response.totalCount > 0 && response.items.length === 0)
    ) {
      throw new Error(paginationError)
    }
    expectedCount = response.totalCount
    expectedPageSize = response.pageSize
    pageCount = Math.ceil(expectedCount / expectedPageSize)
    for (const alert of response.items) {
      if (!loaded.has(alert.id)) {
        loaded.set(alert.id, alert)
      }
    }
    if (loaded.size > expectedCount) {
      throw new Error(paginationError)
    }
  }
  if (loaded.size !== expectedCount) {
    throw new Error(paginationError)
  }
  return [...loaded.values()]
}

export function shouldReloadWorkspaceAlerts(
  previous: DetectionStatus | null,
  next: DetectionStatus,
) {
  // The first list may have been captured before the initial status request completed.
  return (
    !previous ||
    next.lastEvaluatedAt !== previous.lastEvaluatedAt ||
    (previous.pendingCount > 0 && next.pendingCount === 0)
  )
}
