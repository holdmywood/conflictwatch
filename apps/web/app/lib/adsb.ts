/**
 * ADS-B aircraft provider — OpenSky Network (public, anonymous, rate-limited).
 *
 * Anonymous access works but is heavily rate-limited and global coverage is
 * partial. Optional OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET raise the limit.
 * Military aircraft frequently do not broadcast ADS-B or broadcast filtered —
 * coverage of military flights is partial by nature, and the UI says so. We do
 * not infer "military" from anything OpenSky doesn't actually provide.
 */

export interface Aircraft {
  icao24: string
  callsign: string
  originCountry: string
  lat: number
  lng: number
  baroAltitudeM: number | null
  velocityMs: number | null
  trueTrack: number | null
  onGround: boolean
}

export interface AdsbSnapshot {
  aircraft: Aircraft[]
  asOf: string
  source: 'OpenSky'
  note: string
}

export interface BBox {
  latMin: number
  lngMin: number
  latMax: number
  lngMax: number
}

const MAX_AIRCRAFT = 400

type StateVector = [
  string, string | null, string, number | null, number | null,
  number | null, number | null, number | null, boolean, number | null,
  number | null, ...unknown[],
]

export async function fetchAircraft(bbox: BBox): Promise<AdsbSnapshot> {
  const url =
    `https://opensky-network.org/api/states/all?lamin=${bbox.latMin}&lamax=${bbox.latMax}` +
    `&lomin=${bbox.lngMin}&lomax=${bbox.lngMax}`

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`OpenSky ${res.status}`)
  const data = (await res.json()) as { time: number; states: StateVector[] | null }

  const aircraft: Aircraft[] = (data.states ?? [])
    .filter(s => s[5] !== null && s[6] !== null)
    .slice(0, MAX_AIRCRAFT)
    .map(s => ({
      icao24: s[0],
      callsign: (s[1] ?? '').trim(),
      originCountry: s[2],
      lng: s[5] as number,
      lat: s[6] as number,
      baroAltitudeM: s[7],
      velocityMs: s[9],
      trueTrack: s[10],
      onGround: s[8],
    }))

  return {
    aircraft,
    asOf: new Date(data.time * 1000).toISOString(),
    source: 'OpenSky',
    note: 'ADS-B coverage is partial; many military flights do not broadcast or are filtered.',
  }
}
