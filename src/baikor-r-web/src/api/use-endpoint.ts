import { useCallback, useRef, useState } from 'react'
import type { EndpointState } from './types'

export function useEndpoint<TArguments extends unknown[], TResult>(
  request: (...arguments_: TArguments) => Promise<TResult>,
) {
  const requestRef = useRef(request)
  requestRef.current = request
  const [state, setState] = useState<EndpointState<TResult>>({
    data: null,
    error: null,
    isLoading: false,
  })

  const execute = useCallback(async (...arguments_: TArguments) => {
    setState((current) => ({ ...current, error: null, isLoading: true }))
    try {
      const data = await requestRef.current(...arguments_)
      setState({ data, error: null, isLoading: false })
      return data
    } catch (error) {
      setState((current) => ({ ...current, error, isLoading: false }))
      throw error
    }
  }, [])

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false })
  }, [])

  return { ...state, execute, reset }
}
