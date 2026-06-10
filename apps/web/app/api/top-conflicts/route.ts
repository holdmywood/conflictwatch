import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

/**
 * Top Conflicts ranking — live, by corroborated recent activity.
 *
 * Rank = count of corroborated (medium/high confidence) events in the trailing
 * window, with threat level as the tiebreaker. Present-state only; the forecast
 * (pEscalation) is attached as a separate labeled field, never folded into rank.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') ?? '7', 10) || 7))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const conflicts = await prisma.conflict.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, region: true, threatLevel: true, currentSituationLine: true },
  })

  const ranked = await Promise.all(
    conflicts.map(async c => {
      const reportCount = await prisma.event.count({
        where: {
          conflictId: c.id,
          classified: true,
          confidence: { in: ['medium', 'high'] },
          publishedAt: { gte: since },
        },
      })
      const latestSignal = await prisma.escalationSignal.findFirst({
        where: { targetId: c.id },
        orderBy: { computedAt: 'desc' },
        select: { pEscalation: true },
      })
      return {
        id: c.id,
        name: c.name,
        region: c.region,
        threatLevel: c.threatLevel,
        currentSituationLine: c.currentSituationLine,
        reportCount,
        pEscalation: latestSignal?.pEscalation ?? null,
      }
    })
  )

  ranked.sort((a, b) => b.reportCount - a.reportCount || b.threatLevel - a.threatLevel)

  return NextResponse.json(
    { windowDays: days, conflicts: ranked.slice(0, 20), asOf: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  )
}
