import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

const API_VERSION = '1'

// GET /api/v1/export?format=json|csv&since=ISO&limit=100
// Returns escalation signals with pEscalation, exposures, provenance.
// Tier-gated stub: accepts ?tier=pro query param (full auth gating in Phase 5).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const format = url.searchParams.get('format') ?? 'json'
  const sinceParam = url.searchParams.get('since')
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '100', 10))

  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const signals = await prisma.escalationSignal.findMany({
    where: { computedAt: { gte: since } },
    orderBy: { computedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      targetId: true,
      scope: true,
      escalationRisk: true,
      pEscalation: true,
      ciLow: true,
      ciHigh: true,
      horizonDays: true,
      modelVersion: true,
      trajectory: true,
      drivers: true,
      actorsOfConcern: true,
      rationale: true,
      usedEventIds: true,
      triggeringFeatures: true,
      computedAt: true,
      resolvedOutcome: true,
      resolvedAt: true,
    },
  })

  if (format === 'csv') {
    const header = 'id,targetId,scope,escalationRisk,pEscalation,ciLow,ciHigh,horizonDays,modelVersion,trajectory,computedAt,resolvedOutcome,resolvedAt'
    const rows = signals.map(s =>
      [
        s.id, s.targetId, s.scope, s.escalationRisk,
        s.pEscalation ?? '', s.ciLow ?? '', s.ciHigh ?? '',
        s.horizonDays ?? '', s.modelVersion, s.trajectory,
        s.computedAt.toISOString(),
        s.resolvedOutcome ?? '', s.resolvedAt?.toISOString() ?? '',
      ].join(',')
    )
    return new Response([header, ...rows].join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="conflictwatch-signals-v${API_VERSION}.csv"`,
        'X-API-Version': API_VERSION,
      },
    })
  }

  return NextResponse.json(
    { apiVersion: API_VERSION, count: signals.length, since: since.toISOString(), signals },
    { headers: { 'X-API-Version': API_VERSION } }
  )
}
