import { SearchOutlined } from '@ant-design/icons'
import { AutoComplete, Input, Skeleton } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchAddressesEndpoint } from '../../../api/endpoints/useSearchAddressesEndpoint'
import type { AddressSearchResult } from '../map/AddressSearchResult'

const searchDebounceMilliseconds = 450
const minimumQueryLength = 3

interface AddressSearchProps {
  onSelect: (result: AddressSearchResult) => void
}

function AddressSearchSkeleton() {
  return (
    <div className="map-search-skeleton" aria-busy="true">
      {[92, 74, 84].map((width) => (
        <Skeleton.Input
          key={width}
          active
          size="small"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  )
}

export function AddressSearch({ onSelect }: AddressSearchProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AddressSearchResult[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSequence = useRef(0)
  const { execute: searchAddresses } = useSearchAddressesEndpoint()

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = null
  }, [])

  const search = useCallback(async (value: string) => {
    const query = value.trim()
    if (query.length < minimumQueryLength) return
    const requestId = ++requestSequence.current

    setIsSearching(true)
    setMessage(null)
    setResults([])
    try {
      const matches = await searchAddresses(query)
      if (requestId !== requestSequence.current) return
      setResults(matches)
      setMessage(matches.length === 0 ? t('constructionSites.map.search.noResults') : null)
    } catch {
      if (requestId !== requestSequence.current) return
      setResults([])
      setMessage(t('constructionSites.map.search.failed'))
    } finally {
      if (requestId === requestSequence.current) setIsSearching(false)
    }
  }, [searchAddresses, t])

  const resetResults = useCallback(() => {
    requestSequence.current += 1
    clearDebounceTimer()
    setResults([])
    setMessage(null)
    setIsSearching(false)
    setIsOpen(false)
  }, [clearDebounceTimer])

  const updateQuery = (value: string) => {
    setQuery(value)
    requestSequence.current += 1
    clearDebounceTimer()
    setResults([])
    setMessage(null)

    if (value.trim().length < minimumQueryLength) {
      setIsSearching(false)
      setIsOpen(false)
      return
    }

    setIsSearching(true)
    setIsOpen(true)
    debounceTimer.current = setTimeout(() => { void search(value) }, searchDebounceMilliseconds)
  }

  const searchImmediately = (value: string) => {
    setQuery(value)
    clearDebounceTimer()
    if (value.trim().length < minimumQueryLength) {
      resetResults()
      return
    }

    setIsOpen(true)
    void search(value)
  }

  const select = (result: AddressSearchResult) => {
    setQuery(result.displayName)
    resetResults()
    onSelect(result)
  }

  useEffect(() => () => {
    requestSequence.current += 1
    clearDebounceTimer()
  }, [clearDebounceTimer])

  const options = results.map((result) => ({
    value: result.id,
    label: result.displayName,
  }))

  return (
    <div className="map-search">
      <AutoComplete
        value={query}
        title={query || undefined}
        options={options}
        open={isOpen}
        filterOption={false}
        notFoundContent={isSearching ? <AddressSearchSkeleton /> : message}
        onSearch={updateQuery}
        onSelect={(resultId) => {
          const result = results.find((candidate) => candidate.id === resultId)
          if (result) select(result)
        }}
        onOpenChange={setIsOpen}
        onClear={() => {
          setQuery('')
          resetResults()
        }}
      >
        <Input
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          aria-label={t('constructionSites.map.search.label')}
          placeholder={t('constructionSites.map.search.placeholder')}
          onPressEnter={(event) => searchImmediately(event.currentTarget.value)}
        />
      </AutoComplete>
    </div>
  )
}
