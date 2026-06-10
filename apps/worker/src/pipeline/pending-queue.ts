import { prisma } from '@conflictwatch/db'
import type { NormalizedEvent } from '../types.js'

// Overflow queue for the per-cycle enrichment cap. A cluster that passed the
// trust gate but missed the cap is deferred here — NOT silently dropped when
// the 15-minute GDELT file rotates. Drained oldest-first at cycle start so
// deferred clusters get priority over fresh ones.

export const MAX_ATTEMPTS = 3

export interface PendingEntry {
  clusterId: string
  attempts: number
  events: NormalizedEvent[]
}

export async function enqueueCluster(
  clusterId: string,
  events: NormalizedEvent[],
  attempts: number,
): Promise<void> {
  await prisma.pendingCluster.upsert({
    where: { clusterId },
    create: {
      clusterId,
      payload: JSON.parse(JSON.stringify(events)),
      attempts,
    },
    update: { attempts },
  })
}

export async function drainPending(limit: number): Promise<PendingEntry[]> {
  const rows = await prisma.pendingCluster.findMany({
    orderBy: { firstSeenAt: 'asc' },
    take: limit,
  })

  // Entries that exhausted their attempts are dropped with a log line —
  // visible loss beats invisible loss.
  const expired = rows.filter(r => r.attempts >= MAX_ATTEMPTS)
  if (expired.length > 0) {
    console.warn(
      `[pending-queue] dropping ${expired.length} clusters after ${MAX_ATTEMPTS} attempts: ` +
      expired.map(r => r.clusterId).join(', ')
    )
    await prisma.pendingCluster.deleteMany({
      where: { clusterId: { in: expired.map(r => r.clusterId) } },
    })
  }

  return rows
    .filter(r => r.attempts < MAX_ATTEMPTS)
    .map(r => ({
      clusterId: r.clusterId,
      attempts: r.attempts,
      events: (r.payload as unknown as Array<Record<string, unknown>>).map(e => ({
        ...e,
        publishedAt: new Date(e.publishedAt as string),
      })) as NormalizedEvent[],
    }))
}

export async function removePending(clusterId: string): Promise<void> {
  await prisma.pendingCluster.deleteMany({ where: { clusterId } })
}
