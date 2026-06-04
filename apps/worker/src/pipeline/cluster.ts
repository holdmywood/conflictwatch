import { prisma } from '@conflictwatch/db'

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

interface ClusterEvent {
  id: string
  conflictId: string | null
  region: string
  actor1: string | null
  actor2: string | null
  eventRootCode: string
  publishedAt: Date
  severity: number
}

// Determine situation status from event count, recency, and tempo.
// Buckets:
//   resolved     — no activity for >72h
//   de-escalating — last event 24–72h ago
//   emerging     — ≤2 events and <48h old
//   escalating   — ≥8 events in window (high tempo)
//   ongoing      — everything else
export function computeSituationStatus(
  eventCount: number,
  lastSeenAt: Date,
  now: Date,
  totalEventCount: number,
): string {
  const ageMs = now.getTime() - lastSeenAt.getTime()
  if (ageMs > 72 * 60 * 60 * 1000) return 'resolved'
  if (ageMs > 24 * 60 * 60 * 1000) return 'de-escalating'
  if (eventCount <= 2) return 'emerging'
  if (totalEventCount >= 8) return 'escalating'
  return 'ongoing'
}

function actorsFromEvent(event: ClusterEvent): string[] {
  return [event.actor1, event.actor2].filter((a): a is string => Boolean(a))
}

function hasActorOverlap(a: string[], b: string[]): boolean {
  return a.some(actor => b.includes(actor))
}

// Match event to an existing open situation (within 7-day window, same conflict,
// same region, overlapping actors or same CAMEO root). If no match, create one.
// Returns the situation ID.
export async function matchOrCreateSituation(event: ClusterEvent): Promise<string> {
  if (!event.conflictId) {
    throw new Error('matchOrCreateSituation: event.conflictId is required')
  }

  const windowStart = new Date(event.publishedAt.getTime() - WINDOW_MS)
  const eventActors = actorsFromEvent(event)

  const existing = await prisma.situation.findFirst({
    where: {
      conflictId: event.conflictId,
      status: { not: 'resolved' },
      lastSeenAt: { gte: windowStart },
      location: event.region,
    },
    orderBy: { lastSeenAt: 'desc' },
  })

  if (existing && (
    existing.cameoRoots.includes(event.eventRootCode) ||
    hasActorOverlap(eventActors, existing.actors)
  )) {
    const mergedActors = [...new Set([...existing.actors, ...eventActors])]
    const mergedCameoRoots = [...new Set([...existing.cameoRoots, event.eventRootCode])]
    const mergedEventIds = [...existing.eventIds, event.id]
    const newStatus = computeSituationStatus(
      mergedEventIds.length,
      event.publishedAt,
      event.publishedAt,
      mergedEventIds.length,
    )

    await prisma.situation.update({
      where: { id: existing.id },
      data: {
        actors: mergedActors,
        cameoRoots: mergedCameoRoots,
        eventIds: mergedEventIds,
        lastSeenAt: event.publishedAt,
        status: newStatus,
      },
    })
    return existing.id
  }

  const actors = actorsFromEvent(event)
  const created = await prisma.situation.create({
    data: {
      conflictId: event.conflictId,
      title: '',
      status: 'emerging',
      location: event.region,
      actors,
      cameoRoots: [event.eventRootCode],
      eventIds: [event.id],
      firstSeenAt: event.publishedAt,
      lastSeenAt: event.publishedAt,
    },
  })
  return created.id
}
