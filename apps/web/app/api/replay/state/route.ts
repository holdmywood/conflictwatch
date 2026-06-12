import { NextResponse } from 'next/server'
import { prisma, threatFromSeverities, THREAT_WINDOW_MS } from '@conflictwatch/db'

/**
 * Platform state as knowable at a historical instant.
 *
 * Strictly point-in-time: events by publishedAt ≤ asOf, signals by
 * computedAt ≤ asOf, and per-conflict threat RECOMPUTED from the trailing
 * window before asOf using the same shared aggregation the live pipeline
 * uses (threatFromSeverities) — replayed history is the production logic
 * applied to historical evidence, never a stored guess.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const asOfParam = url.searchParams.get('asOf')
  if (!asOfParam) {
    return NextResponse.json({ error: 'asOf parameter required (ISO timestamp).' }, { status: 400 })
  }
  const asOf = new Date(asOfParam)
  if (isNaN(asOf.getTime())) {
    return NextResponse.json({ error: 'Invalid asOf timestamp.' }, { status: 400 })
  }
  if (asOf > new Date()) {
    return NextResponse.json({ error: 'asOf cannot be in the future.' }, { status: 400 })
  }

  const windowStart = new Date(asOf.getTime() - THREAT_WINDOW_MS)

  const [conflicts, windowEvents, blipEvents, signals] = await Promise.all([
    prisma.conflict.findMany({
      select: { id: true, name: true, region: true, lat: true, lng: true, currentSituationLine: true },
    }),
    // Corroborated events in the threat window — drive historical threat
    prisma.event.findMany({
      where: {
        publishedAt: { gte: windowStart, lte: asOf },
        classified: true,
        confidence: { in: ['medium', 'high'] },
        locationConfidence: { not: 'low' },
        conflictId: { not: null },
      },
      select: { conflictId: true, severity: true },
    }),
    // Recent events for globe blips (72h before asOf)
    prisma.event.findMany({
      where: {
        publishedAt: { gte: new Date(asOf.getTime() - 72 * 3600 * 1000), lte: asOf },
        classified: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
      select: {
        id: true, title: true, lat: true, lng: true, severity: true, publishedAt: true,
        sources: { select: { id: true, name: true, url: true } },
      },
    }),
    prisma.escalationSignal.findMany({
      where: { computedAt: { lte: asOf } },
      orderBy: { computedAt: 'desc' },
      take: 200,
      select: {
        id: true, targetId: true, escalationRisk: true, pEscalation: true, ciLow: true,
        ciHigh: true, horizonDays: true, modelVersion: true, trajectory: true,
        drivers: true, actorsOfConcern: true, rationale: true, computedAt: true, usedEventIds: true,
      },
    }),
  ])

  // Historical threat per conflict, recomputed from the window's evidence
  const sevByConflict = new Map<string, number[]>()
  for (const e of windowEvents) {
    const list = sevByConflict.get(e.conflictId!) ?? []
    list.push(e.severity)
    sevByConflict.set(e.conflictId!, list)
  }

  const historicalConflicts = conflicts
    .map(c => ({
      ...c,
      threatLevel: threatFromSeverities(sevByConflict.get(c.id) ?? []),
    }))
    // A conflict "existed" at asOf only if it had window evidence
    .filter(c => sevByConflict.has(c.id))
    .sort((a, b) => b.threatLevel - a.threatLevel)

  // Latest signal per conflict as of asOf
  const latestSignal = new Map<string, (typeof signals)[0]>()
  for (const s of signals) {
    if (!latestSignal.has(s.targetId)) latestSignal.set(s.targetId, s)
  }

  return NextResponse.json(
    {
      asOf: asOf.toISOString(),
      conflicts: historicalConflicts,
      events: blipEvents,
      signals: Array.from(latestSignal.values()).map(s => ({
        ...s,
        computedAt: s.computedAt.toISOString(),
      })),
    },
    // Historical states are immutable — cache aggressively
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  )
}
