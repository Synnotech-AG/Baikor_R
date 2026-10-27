import type { AddressSearchResult } from './AddressSearchResult'

export interface AddressSuggestionState {
  query: string
  results: AddressSearchResult[]
  status: 'idle' | 'searching' | 'ready' | 'empty' | 'failed'
}

export class AddressSuggestions {
  private state: AddressSuggestionState = { query: '', results: [], status: 'idle' }
  private sequence = 0
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private search: (query: string) => Promise<AddressSearchResult[]>
  private publish: (state: AddressSuggestionState) => void

  constructor(
    search: (query: string) => Promise<AddressSearchResult[]>,
    publish: (state: AddressSuggestionState) => void,
  ) {
    this.search = search
    this.publish = publish
  }

  updateQuery(query: string) {
    this.invalidate()
    const canSearch = query.trim().length >= 3
    this.update({ query, results: [], status: canSearch ? 'searching' : 'idle' })
    if (!canSearch) return

    const sequence = this.sequence
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.load(query.trim(), sequence)
    }, 450)
  }

  select(resultId: string): AddressSearchResult | undefined {
    const result = this.state.results.find((candidate) => candidate.id === resultId)
    if (!result || this.state.status !== 'ready') return undefined
    this.invalidate()
    this.update({ query: result.displayName, results: [], status: 'idle' })
    return result
  }

  dispose() {
    this.invalidate()
    this.state = { ...this.state, results: [], status: 'idle' }
  }

  private invalidate() {
    this.sequence += 1
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
  }

  private update(state: AddressSuggestionState) {
    this.state = state
    this.publish(state)
  }

  private async load(query: string, sequence: number) {
    try {
      const results = await this.search(query)
      if (sequence !== this.sequence) return
      this.update({ ...this.state, results, status: results.length ? 'ready' : 'empty' })
    } catch {
      if (sequence !== this.sequence) return
      this.update({ ...this.state, results: [], status: 'failed' })
    }
  }
}
