import { prisma } from '@conflictwatch/db'

// Deduplication is DB-backed: an EventSource row with (eventId, url) is the "seen" marker.
// This keeps dedup state in sync with the DB — clearing the DB automatically resets dedup.

// Returns the persisted event id when this GDELT cluster has already been
// classified, regardless of which source URLs we have seen. Distinguishes
// "known cluster, maybe new mention" from "never-seen cluster".
export async function clusterExists(globalEventId: string): Promise<string | null> {
  const event = await prisma.event.findUnique({
    where: { clusterId: globalEventId },
    select: { id: true },
  })
  return event?.id ?? null
}

// Great-circle distance in km between two lat/lng points.
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Cross-source dedup for curated (UCDP) events against existing GDELT events.
// The same real-world incident can appear in both feeds, which would double-
// count toward threat. We only hold ~1 week of GDELT, so deep history can't
// collide — this check is meaningful only in the recent overlap window. Returns
// the id of a near-duplicate *non-UCDP* event in the same conflict within
// `windowDays` and `radiusKm`, or null. Prefer skipping the curated insert when
// a match exists, so the incident is counted once.
export async function findGdeltNearDuplicate(
  e: { conflictId: string; lat: number; lng: number; publishedAt: Date },
  windowDays = 2,
  radiusKm = 50,
): Promise<string | null> {
  const windowMs = windowDays * 24 * 3600 * 1000
  const candidates = await prisma.event.findMany({
    where: {
      conflictId: e.conflictId,
      publishedAt: { gte: new Date(e.publishedAt.getTime() - windowMs), lte: new Date(e.publishedAt.getTime() + windowMs) },
      // GDELT clusterIds are numeric GLOBALEVENTIDs; UCDP uses an `ucdp-` prefix.
      NOT: { clusterId: { startsWith: 'ucdp-' } },
    },
    select: { id: true, lat: true, lng: true },
  })
  for (const c of candidates) {
    if (haversineKm(e.lat, e.lng, c.lat, c.lng) <= radiusKm) return c.id
  }
  return null
}

export async function isDuplicate(
  globalEventId: string,
  url: string
): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { clusterId: globalEventId },
    select: { id: true },
  })
  if (!event) return false
  const source = await prisma.eventSource.findUnique({
    where: { eventId_url: { eventId: event.id, url } },
  })
  return source !== null
}
