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

// Normalize a GDELT ActionGeo full name to a grouping key.
// "City, ADM1, Country" → "adm1, country" — city-level granularity fragments
// one story across neighborhoods; ADM1+country is the story's natural extent.
export function situationLocationKey(region: string): string {
  const segments = region.split(',').map(s => s.trim()).filter(Boolean)
  return segments.slice(-2).join(', ').toLowerCase()
}

// Most severe CAMEO root present wins the type label.
const ROOT_TITLE: Array<[string, string]> = [
  ['20', 'Mass violence'],
  ['19', 'Armed conflict'],
  ['18', 'Assaults'],
  ['17', 'Coercive incidents'],
]

// Deterministic title — no LLM. "Russia–Ukraine armed conflict — Kyiv, Ukraine"
export function buildSituationTitle(
  actors: string[],
  cameoRoots: string[],
  displayLocation: string,
): string {
  const type = ROOT_TITLE.find(([root]) => cameoRoots.includes(root))?.[1] ?? 'Incident series'
  if (actors.length >= 2) {
    return `${actors[0]}–${actors[1]} ${type.toLowerCase()} — ${displayLocation}`
  }
  if (actors.length === 1) {
    return `${actors[0]} ${type.toLowerCase()} — ${displayLocation}`
  }
  return `${type} — ${displayLocation}`
}

// Match event to an existing open situation (within 7-day window, same conflict,
// same normalized location, overlapping actors or same CAMEO root). If no
// match, create one. Returns the situation ID.
export async function matchOrCreateSituation(event: ClusterEvent): Promise<string> {
  if (!event.conflictId) {
    throw new Error('matchOrCreateSituation: event.conflictId is required')
  }

  const windowStart = new Date(event.publishedAt.getTime() - WINDOW_MS)
  const eventActors = actorsFromEvent(event)
  const locationKey = situationLocationKey(event.region)

  const existing = await prisma.situation.findFirst({
    where: {
      conflictId: event.conflictId,
      status: { not: 'resolved' },
      lastSeenAt: { gte: windowStart },
      location: locationKey,
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
        // Backfill titles for situations created before titles existed
        ...(existing.title === ''
          ? { title: buildSituationTitle(mergedActors, mergedCameoRoots, event.region) }
          : {}),
      },
    })
    return existing.id
  }

  const actors = actorsFromEvent(event)
  const created = await prisma.situation.create({
    data: {
      conflictId: event.conflictId,
      title: buildSituationTitle(actors, [event.eventRootCode], event.region),
      status: 'emerging',
      location: locationKey,
      actors,
      cameoRoots: [event.eventRootCode],
      eventIds: [event.id],
      firstSeenAt: event.publishedAt,
      lastSeenAt: event.publishedAt,
    },
  })
  return created.id
}

// Status decay for situations with no fresh events. Statuses are otherwise
// only recomputed on event arrival, so a story that simply stops stays
// "ongoing" forever. Run hourly. Returns the number of situations updated.
export async function decayStaleSituations(now: Date = new Date()): Promise<number> {
  const open = await prisma.situation.findMany({
    where: { status: { not: 'resolved' } },
    select: { id: true, status: true, eventIds: true, lastSeenAt: true },
  })

  let changed = 0
  for (const sit of open) {
    const next = computeSituationStatus(sit.eventIds.length, sit.lastSeenAt, now, sit.eventIds.length)
    if (next !== sit.status) {
      await prisma.situation.update({ where: { id: sit.id }, data: { status: next } })
      changed++
    }
  }
  return changed
}
