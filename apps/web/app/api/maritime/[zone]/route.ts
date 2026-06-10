import { NextResponse } from 'next/server'
import { collectVessels } from '../../../lib/ais'
import { HOTSPOTS } from '../../../lib/hotspots'
import { rateLimit, clientKey } from '../../../lib/rate-limit'

// Live AIS snapshot around a hotspot. Key-gated: without AISSTREAM_API_KEY
// this returns { configured: false } and the UI shows a labeled placeholder.
// Each call holds a websocket open for ~6s — rate-limited accordingly.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ zone: string }> }
) {
  const { zone } = await params
  const hotspot = HOTSPOTS.find(h => h.zone === zone)
  if (!hotspot) {
    return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })
  }

  const limit = rateLimit(`maritime:${clientKey(req)}`, 4, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Retry shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  // ~±1.5° box around the chokepoint — wide enough for approach traffic
  const snapshot = await collectVessels({
    latMin: hotspot.lat - 1.5,
    lngMin: hotspot.lng - 1.5,
    latMax: hotspot.lat + 1.5,
    lngMax: hotspot.lng + 1.5,
  })

  return NextResponse.json({
    zone,
    asOf: new Date().toISOString(),
    ...snapshot,
  })
}
