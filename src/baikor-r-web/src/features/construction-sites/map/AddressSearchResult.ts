export interface AddressSearchResult {
  id: string
  displayName: string
  latitude: number
  longitude: number
  boundingBox: [south: number, north: number, west: number, east: number]
}
