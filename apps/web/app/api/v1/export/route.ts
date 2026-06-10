import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

const API_VERSION = '1'

// GET /api/v1/export?format=json|csv&since=ISO&limit=100
// Returns escalation signals with pEscalation, exposures, provenance.
//
// Access: requires the EXPORT_API_KEY env secret via Authorization: Bearer or
// x-api-key. With no key configured the route is disabled — an open export of
// the full signal history is not an acceptable default. Replace with real
// per-user auth + tier gating when the auth phase lands.
export async function GET(req: Request) {
  const configuredKey = process.env.EXPORT_API_KEY
  if (!configuredKey) {
    return NextResponse.json(
      { error: 'Export is disabled. Set EXPORT_API_KEY to enable this endpoint.' },
      { status: 503 }
    )
  }
  const auth = req.headers.get('authorization') ?? ''
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers.get('x-api-key') ?? ''
  if (presented !== configuredKey) {
    return NextResponse.json({ error: 'Invalid or missing API key.' }, { status: 401 })
  }

  const url = new URL(req.url)
  const format = url.searchParams.get('format') ?? 'json'
  const sinceParam = url.searchParams.get('since')

  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const limit = Number.isFinite(parsedLimit) ? Math.min(500, Math.max(1, parsedLimit)) : 100

  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  if (isNaN(since.getTime())) {
    return NextResponse.json({ error: 'Invalid since parameter (ISO timestamp required).' }, { status: 400 })
  }

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
