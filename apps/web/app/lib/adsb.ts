/**
 * Military ADS-B provider — OpenSky Network (public, anonymous, rate-limited).
 *
 * This layer shows ONLY aircraft that classify as military/state with high or
 * medium confidence (see aircraft-classify.ts). Commercial, private, and
 * unknown aircraft are filtered out server-side; the frontend applies the
 * same gate again as a guard.
 *
 * Honesty + safety posture:
 * - Many military aircraft do not broadcast ADS-B or are filtered upstream —
 *   coverage is partial by nature and the UI says so.
 * - Positions are voluntary public broadcasts, served as a delayed snapshot
 *   (≥30 s CDN cache on top of OpenSky's own batching) with coordinates
 *   reduced to ~1 km precision. Display only: no route prediction, no
 *   tasking, no operational guidance.
 * - Optional OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET raise the rate limit.
 */

import { classifyAircraft, shouldDisplayAircraft } from './aircraft-classify'
import type { AircraftClassification, AircraftConfidence, AircraftRole } from './aircraft-classify'

export interface MilitaryAircraft {
  id: string
  icao24: string
  callsign: string
  /** Not provided by OpenSky state vectors — always null, never guessed. */
  registration: string | null
  /** Not provided by OpenSky state vectors — always null, never guessed. */
  aircraftType: string | null
  operator: string | null
  country: string
  role: AircraftRole | null
  classification: AircraftClassification
  confidence: AircraftConfidence
  classificationReason: string
  lat: number
  lng: number
  altitudeM: number | null
  speedMs: number | null
  heading: number | null
  onGround: boolean
  lastSeen: string
  source: 'OpenSky'
}

export interface AdsbSnapshot {
  aircraft: MilitaryAircraft[]
  /** Total broadcasts seen before the military/state filter. */
  totalSeen: number
  asOf: string
  source: 'OpenSky'
  delayed: true
  note: string
}

export interface BBox {
  latMin: number
  lngMin: number
  latMax: number
  lngMax: number
}

const MAX_AIRCRAFT = 300

type StateVector = [
  string, string | null, string, number | null, number | null,
  number | null, number | null, number | null, boolean, number | null,
  number | null, ...unknown[],
]

// ~1 km precision — deliberate reduction for the public display layer
const round2 = (n: number) => Math.round(n * 100) / 100

export async function fetchMilitaryAircraft(
  bbox: BBox,
  opts: { includeUnclassified?: boolean } = {},
): Promise<AdsbSnapshot> {
  const url =
    `https://opensky-network.org/api/states/all?lamin=${bbox.latMin}&lamax=${bbox.latMax}` +
    `&lomin=${bbox.lngMin}&lomax=${bbox.lngMax}`

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`OpenSky ${res.status}`)
  const data = (await res.json()) as { time: number; states: StateVector[] | null }

  const states = (data.states ?? []).filter(s => s[5] !== null && s[6] !== null)

  const aircraft: MilitaryAircraft[] = []
  for (const s of states) {
    const icao24 = s[0]
    const callsign = (s[1] ?? '').trim()
    const verdict = classifyAircraft({ icao24, callsign, originCountry: s[2] })

    // The military/state gate. includeUnclassified exists only for local
    // debugging (the route refuses it outside development).
    if (!shouldDisplayAircraft(verdict) && !opts.includeUnclassified) continue

    aircraft.push({
      id: icao24,
      icao24,
      callsign,
      registration: null,
      aircraftType: null,
      operator: verdict.operator,
      country: s[2],
      role: verdict.role,
      classification: verdict.classification,
      confidence: verdict.confidence,
      classificationReason: verdict.reason,
      lng: round2(s[5] as number),
      lat: round2(s[6] as number),
      altitudeM: s[7],
      speedMs: s[9],
      heading: s[10],
      onGround: s[8],
      lastSeen: new Date(((s[4] as number | null) ?? data.time) * 1000).toISOString(),
      source: 'OpenSky',
    })
    if (aircraft.length >= MAX_AIRCRAFT) break
  }

  return {
    aircraft,
    totalSeen: states.length,
    asOf: new Date(data.time * 1000).toISOString(),
    source: 'OpenSky',
    delayed: true,
    note:
      'Publicly broadcast military/state aircraft only; commercial aircraft are filtered. ' +
      'Many military flights do not broadcast ADS-B — coverage is partial. Delayed snapshot, ~1 km precision.',
  }
}
