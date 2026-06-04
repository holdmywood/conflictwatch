import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(req.url)
  const asOfParam = url.searchParams.get('asOf')

  if (!asOfParam) {
    return NextResponse.json({ error: 'asOf parameter required (ISO timestamp)' }, { status: 400 })
  }
  const asOf = new Date(asOfParam)
  if (isNaN(asOf.getTime())) {
    return NextResponse.json({ error: 'Invalid asOf date' }, { status: 400 })
  }
  if (asOf > new Date()) {
    return NextResponse.json({ error: 'asOf cannot be in the future' }, { status: 400 })
  }

  const conflict = await prisma.conflict.findUnique({ where: { id } })
  if (!conflict) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Strictly point-in-time: only data with publishedAt/snapshotAt/computedAt <= asOf
  const [events, episodes, signals] = await Promise.all([
    prisma.event.findMany({
      where: { conflictId: id, publishedAt: { lte: asOf }, classified: true },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, severity: true, region: true, publishedAt: true, confidence: true },
    }),
    prisma.episodeStore.findMany({
      where: { conflictId: id, snapshotAt: { lte: asOf } },
      orderBy: { snapshotAt: 'desc' },
      take: 10,
      select: { id: true, snapshotAt: true, eventTempo: true, severitySlope: true, spreadLocations: true, escalatedToNational: true },
    }),
    prisma.escalationSignal.findMany({
      where: { targetId: id, computedAt: { lte: asOf } },
      orderBy: { computedAt: 'desc' },
      take: 5,
      select: { id: true, escalationRisk: true, pEscalation: true, ciLow: true, ciHigh: true, computedAt: true, rationale: true },
    }),
  ])

  return NextResponse.json({ conflict, events, episodes, signals, asOf })
}
