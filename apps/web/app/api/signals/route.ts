import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export const dynamic = 'force-dynamic'

/** Latest escalation signal per conflict. Read-only; mirrors the /signals page query. */
export async function GET() {
  const signals = await prisma.escalationSignal.findMany({
    orderBy: { computedAt: 'desc' },
    select: {
      id: true, targetId: true, escalationRisk: true, pEscalation: true,
      ciLow: true, ciHigh: true, horizonDays: true, modelVersion: true,
      trajectory: true, drivers: true, actorsOfConcern: true, rationale: true,
      computedAt: true, usedEventIds: true, triggeringFeatures: true,
    },
  })

  const latestByConflict = new Map<string, (typeof signals)[0]>()
  for (const s of signals) {
    if (!latestByConflict.has(s.targetId)) latestByConflict.set(s.targetId, s)
  }

  return NextResponse.json({
    signals: Array.from(latestByConflict.values()).map(s => ({
      ...s,
      computedAt: s.computedAt.toISOString(),
    })),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
