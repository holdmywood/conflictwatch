import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

interface EpisodeFeatures {
  eventTempo: number; severitySlope: number; spreadLocations: number;
  sourceBreadth: number; actorCount: number;
}

const SCALE = { eventTempo: 1/20, severitySlope: 1/5, spreadLocations: 1/20, sourceBreadth: 1/10, actorCount: 1/20 }

function distance(a: EpisodeFeatures, b: EpisodeFeatures): number {
  return Math.sqrt(Object.keys(SCALE).reduce((s, k) => {
    const key = k as keyof EpisodeFeatures
    return s + Math.pow((a[key] - b[key]) * (SCALE as Record<string, number>)[k], 2)
  }, 0))
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(req.url)
  const asOfParam = url.searchParams.get('asOf')
  const asOfDate = asOfParam ? new Date(asOfParam) : new Date()
  const topN = Math.min(20, parseInt(url.searchParams.get('n') ?? '10', 10))

  if (isNaN(asOfDate.getTime())) {
    return NextResponse.json({ error: 'Invalid asOf date' }, { status: 400 })
  }

  // Get the latest episode for this conflict at or before asOfDate
  const currentEpisode = await prisma.episodeStore.findFirst({
    where: { conflictId: id, snapshotAt: { lte: asOfDate } },
    orderBy: { snapshotAt: 'desc' },
  })

  if (!currentEpisode) {
    return NextResponse.json({ analogues: [], baseRate: 0, dispersion: 0, totalCandidates: 0, asOfDate })
  }

  const query: EpisodeFeatures = {
    eventTempo: currentEpisode.eventTempo,
    severitySlope: currentEpisode.severitySlope,
    spreadLocations: currentEpisode.spreadLocations,
    sourceBreadth: currentEpisode.sourceBreadth,
    actorCount: currentEpisode.actorCount,
  }

  // Candidates: all episodes from other conflicts, snapshotAt < asOfDate
  const candidates = await prisma.episodeStore.findMany({
    where: { conflictId: { not: id }, snapshotAt: { lt: asOfDate } },
    select: {
      id: true, conflictId: true, snapshotAt: true,
      eventTempo: true, severitySlope: true, spreadLocations: true,
      sourceBreadth: true, actorCount: true,
      escalatedToNational: true, escalationHorizonDays: true, assetMovesJson: true,
    },
  })

  const scored = candidates
    .map(ep => ({ ...ep, distance: distance(query, ep as EpisodeFeatures) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topN)

  const resolved = scored.filter(a => a.escalatedToNational !== null)
  const escalatedCount = resolved.filter(a => a.escalatedToNational).length
  const baseRate = resolved.length > 0 ? Math.round(escalatedCount / resolved.length * 100) / 100 : 0
  const mean = baseRate
  const dispersion = resolved.length > 1
    ? Math.round(Math.sqrt(resolved.reduce((s, a) => s + Math.pow((a.escalatedToNational ? 1 : 0) - mean, 2), 0) / resolved.length) * 100) / 100
    : 0

  return NextResponse.json({
    analogues: scored.map(a => ({
      episodeId: a.id,
      conflictId: a.conflictId,
      snapshotAt: a.snapshotAt,
      distance: Math.round(a.distance * 10000) / 10000,
      escalatedToNational: a.escalatedToNational,
      horizonDays: a.escalationHorizonDays,
      assetMovesJson: a.assetMovesJson,
    })),
    baseRate,
    dispersion,
    totalCandidates: candidates.length,
    queryFeatures: query,
    asOfDate,
  })
}
