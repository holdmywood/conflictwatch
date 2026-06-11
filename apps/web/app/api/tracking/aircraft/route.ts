import { NextResponse } from 'next/server'
import { fetchMilitaryAircraft } from '../../../lib/adsb'
import { rateLimit, clientKey } from '../../../lib/rate-limit'

/**
 * Military/state aircraft snapshot from OpenSky ADS-B. Commercial, private,
 * and unclassifiable aircraft are filtered server-side before anything
 * reaches the client (see lib/aircraft-classify.ts). Delayed snapshot with
 * reduced precision — display only, no route prediction or tasking.
 *
 * ?includeUnclassified=1 bypasses the filter for local debugging ONLY; the
 * route refuses it outside development.
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

  const wantsUnclassified = url.searchParams.get('includeUnclassified') === '1'
  if (wantsUnclassified && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'includeUnclassified is a development-only debug flag.' },
      { status: 403 }
    )
  }

  try {
    const snapshot = await fetchMilitaryAircraft(bbox, { includeUnclassified: wantsUnclassified })
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    })
  } catch {
    return NextResponse.json(
      {
        aircraft: [],
        totalSeen: 0,
        source: 'OpenSky',
        delayed: true,
        asOf: new Date().toISOString(),
        note: 'OpenSky unavailable or rate-limited; no aircraft shown.',
      },
      { status: 200 }
    )
  }
}
