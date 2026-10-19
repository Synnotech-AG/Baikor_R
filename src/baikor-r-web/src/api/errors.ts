import axios from 'axios'
import type { ApiProblem } from './types'

export interface ParsedApiError {
  errorKey?: string
  message: string
}

export function parseApiError(error: unknown, fallback: string): ParsedApiError {
  if (!axios.isAxiosError<ApiProblem>(error)) return { message: fallback }

  const problem = error.response?.data
  const validationErrorKey = Object.values(problem?.errorKeys ?? {}).flat()[0]
  const errorKey = validationErrorKey ?? problem?.errorKey
  const validationMessage = Object.values(problem?.errors ?? {}).flat()[0]

  return {
    errorKey,
    message: validationMessage ?? problem?.title ?? error.message ?? fallback,
  }
}
