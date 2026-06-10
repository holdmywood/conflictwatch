import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

/**
 * Global dashboard aggregates — present state and forecast kept as distinct
 * blocks. All counts are computed, not estimated.
 */
export async function GET() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [activeConflicts, eventsThisWeek, heartbeat] = await Promise.all([
    prisma.conflict.count({ where: { status: 'active' } }),
    prisma.event.count({ where: { classified: true, publishedAt: { gte: weekAgo } } }),
    prisma.heartbeat.findUnique({ where: { id: 1 } }),
  ])

  // Escalation watch list: latest signal per conflict, highest pEscalation first
  const signals = await prisma.escalationSignal.findMany({
    orderBy: { computedAt: 'desc' },
    select: {
      targetId: true, escalationRisk: true, pEscalation: true, ciLow: true, ciHigh: true,
      horizonDays: true, computedAt: true,
    },
  })
  const latestByConflict = new Map<string, (typeof signals)[number]>()
  for (const s of signals) if (!latestByConflict.has(s.targetId)) latestByConflict.set(s.targetId, s)

  const conflictNames = await prisma.conflict.findMany({
    where: { id: { in: [...latestByConflict.keys()] } },
    select: { id: true, name: true, threatLevel: true },
  })
  const nameById = new Map(conflictNames.map(c => [c.id, c]))

  const watchList = [...latestByConflict.values()]
    .filter(s => s.pEscalation !== null)
    .map(s => ({
      conflictId: s.targetId,
      name: nameById.get(s.targetId)?.name ?? s.targetId,
      threatLevel: nameById.get(s.targetId)?.threatLevel ?? 1,
      escalationRisk: s.escalationRisk,
      pEscalation: s.pEscalation,
      ciLow: s.ciLow,
      ciHigh: s.ciHigh,
      horizonDays: s.horizonDays,
    }))
    .sort((a, b) => (b.pEscalation ?? 0) - (a.pEscalation ?? 0))
    .slice(0, 10)

  // Calibration / coverage
  const resolved = await prisma.calibrationRecord.count({ where: { resolvedAt: { not: null } } })
  const pending = await prisma.calibrationRecord.count({ where: { resolvedAt: null } })

  return NextResponse.json(
    {
      present: {
        activeConflicts,
        eventsThisWeek,
        lastIngestedAt: heartbeat?.lastIngestedAt ?? null,
        sourcesOk: heartbeat?.sourcesOk ?? 0,
        sourcesFailed: heartbeat?.sourcesFailed ?? 0,
      },
      forecast: { watchList },
      calibration: { resolved, pending },
      asOf: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  )
}
