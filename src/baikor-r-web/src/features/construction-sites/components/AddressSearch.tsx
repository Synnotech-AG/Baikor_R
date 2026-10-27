import { LoadingOutlined, SearchOutlined } from '@ant-design/icons'
import { AutoComplete, Input } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchAddressesEndpoint } from '../../../api/endpoints/useSearchAddressesEndpoint'
import type { AddressSearchResult } from '../map/AddressSearchResult'
import { AddressSuggestions, type AddressSuggestionState } from '../map/AddressSuggestions'

interface AddressSearchProps {
  onSelect: (result: AddressSearchResult) => void
}

export function AddressSearch({ onSelect }: AddressSearchProps) {
  const { t } = useTranslation()
  const [{ query, results, status }, setSuggestions] = useState<AddressSuggestionState>({
    query: '', results: [], status: 'idle',
  })
  const [isOpen, setIsOpen] = useState(false)
  const { execute: searchAddresses } = useSearchAddressesEndpoint()
  const [suggestions] = useState(() => new AddressSuggestions(searchAddresses, setSuggestions))

  const updateQuery = (value: string) => {
    suggestions.updateQuery(value)
    setIsOpen(true)
  }

  useEffect(() => () => suggestions.dispose(), [suggestions])

  const message = status === 'empty' ? t('constructionSites.map.search.noResults')
    : status === 'failed' ? t('constructionSites.map.search.failed')
      : status === 'searching' ? t('geometry.addressSearching') : null

  const options = results.map((result) => ({
    value: result.id,
    label: result.displayName,
  }))

  return (
    <div className="map-search" onKeyDownCapture={(event) => {
      if (event.key === 'Tab') {
        // The select library also accepts Tab; leaving this field must not move the map.
        event.stopPropagation()
        setIsOpen(false)
      } else if (event.key === 'Escape') {
        setIsOpen(false)
      } else if (event.key === 'Enter' && (
        event.nativeEvent.isComposing || !isOpen || status !== 'ready'
      )) {
        event.preventDefault()
        event.stopPropagation()
      }
    }}>
      <AutoComplete
        value={query}
        title={query || undefined}
        options={options}
        open={isOpen && status === 'ready'}
        defaultActiveFirstOption
        showSearch={{ filterOption: false, onSearch: updateQuery }}
        notFoundContent={null}
        onSelect={(resultId) => {
          const result = suggestions.select(resultId)
          if (!result) return
          setIsOpen(false)
          onSelect(result)
        }}
        onOpenChange={setIsOpen}
        onBlur={() => setIsOpen(false)}
        onClear={() => {
          suggestions.updateQuery('')
          setIsOpen(false)
        }}
      >
        <Input
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          aria-label={t('constructionSites.map.search.label')}
          placeholder={t('constructionSites.map.search.placeholder')}
        />
      </AutoComplete>
      <div className="map-search-feedback" role="status" aria-live="polite" aria-atomic="true">
        {isOpen && message && <>
          {status === 'searching' && <LoadingOutlined spin aria-hidden />}
          <span>{message}</span>
        </>}
      </div>
    </div>
  )
}
