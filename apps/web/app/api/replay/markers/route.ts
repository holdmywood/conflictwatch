import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

/**
 * Significant events for the timeline track: high-severity corroborated
 * events (S4+) and elevated/high escalation signals inside the range.
 * Everything here is archived platform data with provenance — markers are
 * navigation aids, not new claims.
 */
export interface TimelineMarker {
  id: string
  kind: 'event' | 'signal'
  label: string
  severity: number | null
  at: string
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = new Date(url.searchParams.get('from') ?? '')
  const to = new Date(url.searchParams.get('to') ?? '')
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
    return NextResponse.json({ error: 'Valid from/to ISO timestamps required.' }, { status: 400 })
  }

  const [events, signals] = await Promise.all([
    prisma.event.findMany({
      where: {
        publishedAt: { gte: from, lte: to },
        classified: true,
        severity: { gte: 4 },
        confidence: { in: ['medium', 'high'] },
      },
      orderBy: { publishedAt: 'asc' },
      take: 60,
      select: { id: true, title: true, severity: true, publishedAt: true },
    }),
    prisma.escalationSignal.findMany({
      where: {
        computedAt: { gte: from, lte: to },
        escalationRisk: { in: ['elevated', 'high'] },
      },
      orderBy: { computedAt: 'asc' },
      take: 40,
      select: { id: true, targetId: true, escalationRisk: true, computedAt: true },
    }),
  ])

  const markers: TimelineMarker[] = [
    ...events.map(e => ({
      id: `evt-${e.id}`,
      kind: 'event' as const,
      label: e.title,
      severity: e.severity,
      at: e.publishedAt.toISOString(),
    })),
    ...signals.map(s => ({
      id: `sig-${s.id}`,
      kind: 'signal' as const,
      label: `Escalation signal (${s.escalationRisk}) — ${s.targetId.replace('conflict-', '').toUpperCase()}`,
      severity: null,
      at: s.computedAt.toISOString(),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return NextResponse.json(
    { markers },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } }
  )
}
