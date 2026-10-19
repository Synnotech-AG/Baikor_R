export interface ServerErrorEvent {
  errorKey?: string
  fallbackMessage: string
}

type ServerErrorListener = (event: ServerErrorEvent) => void

let listener: ServerErrorListener | null = null

export function registerServerErrorListener(nextListener: ServerErrorListener) {
  listener = nextListener
  return () => {
    if (listener === nextListener) listener = null
  }
}

export function reportServerError(event: ServerErrorEvent) {
  listener?.(event)
}
