export interface ApiProblem {
  title?: string
  errors?: Record<string, string[]>
  errorKey?: string
  errorKeys?: Record<string, string[]>
}

export interface EndpointState<TResult> {
  data: TResult | null
  error: unknown
  isLoading: boolean
}
