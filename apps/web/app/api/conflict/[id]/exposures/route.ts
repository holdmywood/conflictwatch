import { NextResponse } from 'next/server'
import { prisma, inferZonesFromRegion } from '@conflictwatch/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const conflict = await prisma.conflict.findUnique({
    where: { id },
    select: { id: true, region: true },
  })
  if (!conflict) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Also pull chokepoints from the most recent EpisodeStore snapshot
  const latestEpisode = await prisma.episodeStore.findFirst({
    where: { conflictId: id },
    orderBy: { snapshotAt: 'desc' },
    select: { chokepoints: true },
  })
  const chokepoints = latestEpisode?.chokepoints ?? []

  const zones = inferZonesFromRegion(conflict.region, chokepoints)
  if (zones.length === 0) {
    return NextResponse.json({ exposures: [], zones: [] })
  }

  const exposures = await prisma.exposureLink.findMany({
    where: { zone: { in: zones } },
    orderBy: { weight: 'desc' },
    select: {
      zone: true,
      zoneLabel: true,
      zoneType: true,
      instrument: true,
      instrumentLabel: true,
      assetClass: true,
      linkType: true,
      weight: true,
      notes: true,
    },
  })

  return NextResponse.json({ exposures, zones })
}
