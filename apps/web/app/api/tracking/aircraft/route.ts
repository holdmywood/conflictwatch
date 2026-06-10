import { NextResponse } from 'next/server'
import { fetchAircraft } from '../../../lib/adsb'
import { rateLimit, clientKey } from '../../../lib/rate-limit'

/**
 * Global ADS-B snapshot from OpenSky. Public + anonymous but heavily
 * rate-limited, so this is rate-limited per client and CDN-cached for 30s.
 * An optional bbox (lamin/lamax/lomin/lomax) narrows the query.
 */
export async function GET(req: Request) {
  const limit = rateLimit(`adsb:${clientKey(req)}`, 6, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Retry shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const url = new URL(req.url)
  const num = (k: string, d: number) => {
    const v = parseFloat(url.searchParams.get(k) ?? '')
    return Number.isFinite(v) ? v : d
  }
  const bbox = {
    latMin: num('lamin', -60),
    latMax: num('lamax', 75),
    lngMin: num('lomin', -170),
    lngMax: num('lomax', 170),
  }

  try {
    const snapshot = await fetchAircraft(bbox)
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    })
  } catch {
    return NextResponse.json(
      { aircraft: [], source: 'OpenSky', asOf: new Date().toISOString(), note: 'OpenSky unavailable or rate-limited; no aircraft shown.' },
      { status: 200 }
    )
  }
}
