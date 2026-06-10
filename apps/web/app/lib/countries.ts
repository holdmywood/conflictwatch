/**
 * Country polygon set + deterministic conflict↔country binding.
 *
 * Conflicts carry lat/lng derived from their events, so binding a conflict to
 * its country polygon is a point-in-polygon test — no fragile name matching
 * and no FIPS↔ISO crosswalk table. Name matching survives only as a fallback
 * for conflicts whose coordinates fall outside every polygon (coastal events,
 * centroid fallbacks on small islands).
 */

import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import countriesTopo from 'world-atlas/countries-110m.json'

export interface CountryPolyFeature {
  type: 'Feature'
  properties: { name: string }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
}

export const COUNTRY_FEATURES: CountryPolyFeature[] = (() => {
  const topo = countriesTopo as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
  const fc = feature(topo, topo.objects.countries) as unknown as { features: CountryPolyFeature[] }
  return fc.features
})()

// Natural Earth long forms ↔ GDELT-derived short names (fallback matching only)
const NE_NAME_TO_GDELT: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'Democratic Republic of the Congo',
  'Central African Rep.': 'Central African Republic',
  'S. Sudan': 'South Sudan',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Czechia': 'Czech Republic',
  'Dominican Rep.': 'Dominican Republic',
  'Eq. Guinea': 'Equatorial Guinea',
  "Côte d'Ivoire": 'Ivory Coast',
  'Myanmar': 'Burma',
}

export function gdeltName(neName: string): string {
  return NE_NAME_TO_GDELT[neName] ?? neName
}

/* ── Point-in-polygon (ray casting, lng/lat) ─────────────────────────────── */

type Ring = Array<[number, number]>

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointInPolygon(lng: number, lat: number, coords: Ring[]): boolean {
  if (coords.length === 0) return false
  if (!pointInRing(lng, lat, coords[0])) return false
  // Holes: inside a hole = outside the polygon
  for (let i = 1; i < coords.length; i++) {
    if (pointInRing(lng, lat, coords[i])) return false
  }
  return true
}

export function pointInCountry(lng: number, lat: number, f: CountryPolyFeature): boolean {
  if (f.geometry.type === 'Polygon') {
    return pointInPolygon(lng, lat, f.geometry.coordinates as Ring[])
  }
  return (f.geometry.coordinates as Ring[][]).some(poly => pointInPolygon(lng, lat, poly))
}

/** Find the Natural Earth country containing a coordinate, or null (open sea). */
export function countryAt(lat: number, lng: number): CountryPolyFeature | null {
  for (const f of COUNTRY_FEATURES) {
    if (pointInCountry(lng, lat, f)) return f
  }
  return null
}

/* ── Country centroids (bbox center of the largest ring) ─────────────────── */

function ringBboxCenter(rings: Ring[]): [number, number] {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lng, lat] of rings[0]) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2]
}

const CENTROIDS: Map<string, [number, number]> = (() => {
  const m = new Map<string, [number, number]>()
  for (const f of COUNTRY_FEATURES) {
    const polys = f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates as Ring[]]
      : (f.geometry.coordinates as Ring[][])
    // Largest polygon by first-ring vertex count — avoids tiny offshore territories
    const largest = polys.reduce((a, b) => (b[0].length > a[0].length ? b : a))
    m.set(f.properties.name.toLowerCase(), ringBboxCenter(largest))
  }
  return m
})()

// Common WHO/news country spellings → Natural Earth names
const COUNTRY_ALIASES: Record<string, string> = {
  'united states': 'United States of America',
  'usa': 'United States of America',
  'democratic republic of the congo': 'Dem. Rep. Congo',
  'dr congo': 'Dem. Rep. Congo',
  'drc': 'Dem. Rep. Congo',
  'republic of the congo': 'Congo',
  'tanzania': 'Tanzania',
  'south sudan': 'S. Sudan',
  'central african republic': 'Central African Rep.',
  'ivory coast': "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  'burma': 'Myanmar',
  'czech republic': 'Czechia',
  'bosnia and herzegovina': 'Bosnia and Herz.',
  'equatorial guinea': 'Eq. Guinea',
  'dominican republic': 'Dominican Rep.',
}

/** Resolve a country name (NE or common spelling) to [lat, lng], or null. */
export function countryCentroid(name: string): [number, number] | null {
  const key = name.trim().toLowerCase()
  const aliased = COUNTRY_ALIASES[key]
  if (aliased) return CENTROIDS.get(aliased.toLowerCase()) ?? null
  return CENTROIDS.get(key) ?? null
}

/** Resolve a country name (NE or common spelling) to its Natural Earth name. */
export function toNeName(name: string): string | null {
  const key = name.trim().toLowerCase()
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key]
  return CENTROIDS.has(key) ? COUNTRY_FEATURES.find(f => f.properties.name.toLowerCase() === key)?.properties.name ?? null : null
}

/** Known country names for parsing free-text titles ("…, Uganda"). */
export const COUNTRY_NAMES: string[] = (() => {
  const names = COUNTRY_FEATURES.map(f => f.properties.name)
  return [...names, ...Object.keys(COUNTRY_ALIASES).map(k => k.replace(/\b\w/g, c => c.toUpperCase()))]
})()

/**
 * Bind conflicts to NE country names: point-in-polygon first, name fallback.
 * Returns both directions — conflictId → NE name, NE name → conflict.
 */
export function bindConflictsToCountries<T extends { id: string; name: string; lat: number; lng: number }>(
  conflicts: T[],
): { neNameByConflictId: Map<string, string>; conflictByNeName: Map<string, T> } {
  const neNameByConflictId = new Map<string, string>()
  const conflictByNeName = new Map<string, T>()

  for (const c of conflicts) {
    let neName: string | null = countryAt(c.lat, c.lng)?.properties.name ?? null
    if (!neName) {
      const target = c.name.toLowerCase()
      neName =
        COUNTRY_FEATURES.find(f => gdeltName(f.properties.name).toLowerCase() === target)
          ?.properties.name ?? null
    }
    if (neName) {
      neNameByConflictId.set(c.id, neName)
      conflictByNeName.set(neName, c)
    }
  }
  return { neNameByConflictId, conflictByNeName }
}
