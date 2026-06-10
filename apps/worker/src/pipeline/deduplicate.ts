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
