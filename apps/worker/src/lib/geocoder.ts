import { COUNTRY_CENTROIDS } from './centroids.js'

export function resolveCoords(
  lat: number,
  lng: number,
  countryCode: string
): { lat: number; lng: number } | null {
  const isZero = lat === 0 && lng === 0
  if (!isZero) return { lat, lng }
  const centroid = COUNTRY_CENTROIDS[countryCode.toUpperCase()]
  return centroid ?? null
}
