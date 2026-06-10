/**
 * Curated strategic hotspots/chokepoints — version-controlled editorial data.
 *
 * Coordinates are geographic facts (strait midpoints); everything analytical
 * about a hotspot (exposure linkages, weights) lives in the ExposureLink
 * graph and goes through the human curation process in docs/curation.md.
 * `zone` slugs match ExposureLink.zone so the two join.
 *
 * reviewStatus mirrors the exposure-graph convention: rows a human has not
 * confirmed are flagged in the UI.
 */

export const HOTSPOTS_VERSION = 1

export interface Hotspot {
  zone: string // joins ExposureLink.zone
  label: string
  lat: number
  lng: number
  kind: 'chokepoint' | 'shipping_lane' | 'strait'
  reviewStatus: 'approved' | 'unreviewed'
}

export const HOTSPOTS: readonly Hotspot[] = [
  { zone: 'hormuz', label: 'Strait of Hormuz', lat: 26.57, lng: 56.25, kind: 'chokepoint', reviewStatus: 'approved' },
  { zone: 'suez', label: 'Suez Canal', lat: 30.46, lng: 32.35, kind: 'chokepoint', reviewStatus: 'approved' },
  { zone: 'bab-el-mandeb', label: 'Bab-el-Mandeb', lat: 12.58, lng: 43.33, kind: 'chokepoint', reviewStatus: 'unreviewed' },
  { zone: 'bosphorus', label: 'Bosphorus', lat: 41.12, lng: 29.08, kind: 'strait', reviewStatus: 'unreviewed' },
  { zone: 'malacca', label: 'Strait of Malacca', lat: 2.5, lng: 101.2, kind: 'chokepoint', reviewStatus: 'unreviewed' },
  { zone: 'panama', label: 'Panama Canal', lat: 9.08, lng: -79.68, kind: 'chokepoint', reviewStatus: 'unreviewed' },
  { zone: 'taiwan-strait', label: 'Taiwan Strait', lat: 24.4, lng: 119.3, kind: 'strait', reviewStatus: 'unreviewed' },
  { zone: 'gibraltar', label: 'Strait of Gibraltar', lat: 35.95, lng: -5.6, kind: 'strait', reviewStatus: 'unreviewed' },
] as const
