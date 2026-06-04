import { prisma } from '@conflictwatch/db'

export interface PointInTimeEvent {
  id: string
  severity: number
  region: string
  actor1: string | null
  actor2: string | null
  publishedAt: Date
  confidence: string
  locationConfidence: string
}

// Fetch events for a conflict as knowable at asOfDate.
// Strictly enforces: NO event with publishedAt > asOfDate is returned.
// Also applies a trailing window of windowDays (default 7).
// Throws if asOfDate is in the future (defensive guard against misuse).
export async function getEventsAsOf(
  conflictId: string,
  asOfDate: Date,
  windowDays: number = 7,
): Promise<PointInTimeEvent[]> {
  if (asOfDate > new Date()) {
    throw new Error(`[point-in-time] asOfDate ${asOfDate.toISOString()} is in the future`)
  }
  const windowStart = new Date(asOfDate.getTime() - windowDays * 24 * 60 * 60 * 1000)
  return prisma.event.findMany({
    where: {
      conflictId,
      classified: true,
      publishedAt: { gte: windowStart, lte: asOfDate },
    },
    select: {
      id: true,
      severity: true,
      region: true,
      actor1: true,
      actor2: true,
      publishedAt: true,
      confidence: true,
      locationConfidence: true,
    },
  })
}
