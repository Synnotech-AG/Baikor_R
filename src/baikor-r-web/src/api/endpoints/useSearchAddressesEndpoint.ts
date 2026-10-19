import axios from 'axios'
import type { AddressSearchResult } from '../../features/construction-sites/map/AddressSearchResult'
import { useEndpoint } from '../useEndpoint'

const addressSearchClient = axios.create({
  baseURL: import.meta.env.VITE_ADDRESS_SEARCH_URL ?? 'https://photon.komoot.io',
  timeout: 10_000,
  headers: { 'Accept-Language': 'de' },
})

type PhotonProperties = {
  osm_type?: string
  osm_id?: number
  type?: string
  name?: string
  street?: string
  housenumber?: string
  postcode?: string
  city?: string
  district?: string
  locality?: string
  country?: string
  extent?: [west: number, north: number, east: number, south: number]
}

type PhotonFeature = {
  geometry: {
    coordinates: [longitude: number, latitude: number]
  }
  properties: PhotonProperties
}

type PhotonSearchResult = {
  features: PhotonFeature[]
}

function formatAddress(properties: PhotonProperties) {
  const street = properties.street
    ? [properties.street, properties.housenumber].filter(Boolean).join(' ')
    : properties.name
  const place = [properties.postcode, properties.city ?? properties.locality]
    .filter(Boolean)
    .join(' ')
  return [properties.name !== street ? properties.name : null, street, properties.district, place, properties.country]
    .filter((part, index, parts): part is string => Boolean(part) && parts.indexOf(part) === index)
    .join(', ')
}

function toBoundingBox(
  extent: PhotonProperties['extent'],
  longitude: number,
  latitude: number,
): AddressSearchResult['boundingBox'] {
  if (extent) return [extent[3], extent[1], extent[0], extent[2]]

  const pointPadding = 0.0005
  return [
    latitude - pointPadding,
    latitude + pointPadding,
    longitude - pointPadding,
    longitude + pointPadding,
  ]
}

export function useSearchAddressesEndpoint() {
  return useEndpoint(async (query: string): Promise<AddressSearchResult[]> => {
    const response = await addressSearchClient.get<PhotonSearchResult>('/api', {
      params: {
        q: query,
        lang: 'de',
        countrycode: 'DE',
        bbox: '11.9,48.9,12.25,49.12',
        lat: 49.0134,
        lon: 12.1016,
        limit: 5,
      },
    })

    return response.data.features.map((feature, index) => {
      const [longitude, latitude] = feature.geometry.coordinates
      return {
        id: [
          feature.properties.osm_type ?? 'result',
          feature.properties.osm_id ?? index,
          feature.properties.type ?? 'place',
          index,
        ].join('-'),
        displayName: formatAddress(feature.properties),
        latitude,
        longitude,
        boundingBox: toBoundingBox(feature.properties.extent, longitude, latitude),
      }
    })
  })
}
