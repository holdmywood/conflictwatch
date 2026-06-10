import { NextResponse } from 'next/server'

/**
 * Natural-hazard feed: USGS real-time earthquakes (primary, reliable) +
 * GDACS multi-hazard alerts (volcanoes, tsunamis, cyclones, floods —
 * best-effort; the response says which sources answered). Derived summaries
 * only; every item links to its source.
 */

export interface Hazard {
  id: string
  kind: 'earthquake' | 'volcano' | 'tsunami' | 'alert'
  title: string
  lat: number
  lng: number
  magnitude: number | null
  alertLevel: 'green' | 'orange' | 'red' | null
  time: string
  url: string
  source: 'USGS' | 'GDACS'
}

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP'

async function fetchUsgs(): Promise<Hazard[]> {
  const res = await fetch(USGS_URL, { signal: AbortSignal.timeout(10_000), next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`USGS ${res.status}`)
  const data = (await res.json()) as {
    features: Array<{
      id: string
      properties: { mag: number | null; place: string | null; time: number; alert: string | null; url: string }
      geometry: { coordinates: [number, number, number] }
    }>
  }
  return data.features
    .filter(f => f.geometry?.coordinates && f.properties.mag !== null)
    .map(f => ({
      id: `usgs-${f.id}`,
      kind: 'earthquake' as const,
      // USGS 'place' is a factual locator string from the source, not a template
      title: `M ${f.properties.mag!.toFixed(1)} — ${f.properties.place ?? 'location pending'}`,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      magnitude: f.properties.mag,
      alertLevel: (f.properties.alert as Hazard['alertLevel']) ?? null,
      time: new Date(f.properties.time).toISOString(),
      url: f.properties.url,
      source: 'USGS' as const,
    }))
}

const GDACS_KIND: Record<string, Hazard['kind']> = {
  VO: 'volcano',
  TS: 'tsunami',
  TC: 'alert',
  FL: 'alert',
  DR: 'alert',
  WF: 'alert',
}

async function fetchGdacs(): Promise<Hazard[]> {
  const res = await fetch(GDACS_URL, { signal: AbortSignal.timeout(10_000), next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`GDACS ${res.status}`)
  const data = (await res.json()) as {
    features?: Array<{
      properties?: {
        eventtype?: string
        eventid?: number | string
        name?: string
        alertlevel?: string
        fromdate?: string
        url?: { report?: string }
      }
      geometry?: { type?: string; coordinates?: [number, number] }
    }>
  }
  const out: Hazard[] = []
  for (const f of data.features ?? []) {
    const p = f.properties
    const kind = p?.eventtype ? GDACS_KIND[p.eventtype] : undefined
    const coords = f.geometry?.type === 'Point' ? f.geometry.coordinates : undefined
    if (!kind || !p || !coords) continue // EQ skipped — USGS covers it better
    const alert = p.alertlevel?.toLowerCase()
    out.push({
      id: `gdacs-${p.eventtype}-${p.eventid ?? `${coords[1]},${coords[0]}`}`,
      kind,
      title: p.name?.trim() || `${p.eventtype} event`,
      lat: coords[1],
      lng: coords[0],
      magnitude: null,
      alertLevel: alert === 'red' || alert === 'orange' || alert === 'green' ? alert : null,
      time: p.fromdate ? new Date(p.fromdate).toISOString() : new Date(0).toISOString(),
      url: p.url?.report ?? 'https://www.gdacs.org/',
      source: 'GDACS' as const,
    })
  }
  return out
}

export async function GET() {
  const [usgs, gdacs] = await Promise.allSettled([fetchUsgs(), fetchGdacs()])

  const hazards: Hazard[] = [
    ...(usgs.status === 'fulfilled' ? usgs.value : []),
    ...(gdacs.status === 'fulfilled' ? gdacs.value : []),
  ]

  return NextResponse.json(
    {
      hazards,
      sources: {
        usgs: usgs.status === 'fulfilled' ? 'ok' : 'unavailable',
        gdacs: gdacs.status === 'fulfilled' ? 'ok' : 'unavailable',
      },
      asOf: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  )
}
