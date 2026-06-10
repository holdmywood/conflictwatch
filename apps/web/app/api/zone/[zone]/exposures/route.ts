import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

// Exposure linkages for a strategic zone (joins lib/hotspots zone slugs).
// Rows carry editorial provenance; unreviewed rows are flagged downstream.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ zone: string }> }
) {
  const { zone } = await params
  if (!/^[a-z0-9-]{1,40}$/.test(zone)) {
    return NextResponse.json({ error: 'Invalid zone slug.' }, { status: 400 })
  }

  const exposures = await prisma.exposureLink.findMany({
    where: { zone },
    orderBy: { weight: 'desc' },
    select: {
      zone: true,
      zoneLabel: true,
      instrument: true,
      instrumentLabel: true,
      assetClass: true,
      linkType: true,
      weight: true,
      notes: true,
      reviewStatus: true,
    },
  })

  return NextResponse.json(
    { zone, exposures },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  )
}
