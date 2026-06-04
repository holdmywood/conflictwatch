/**
 * Backfill script: re-derive stored data under the current ingest/scoring rules.
 *
 * Steps (all idempotent):
 *   1. Delete events with disallowed CAMEO root codes (outside 17-20 allowlist).
 *   2. Delete self-referential events (actor1 == actor2 — GDELT artifact).
 *   3. Batch re-classify unclassified events through the trust-gate + AI pipeline
 *      (MAX_BACKFILL_CLASSIFY per run to control cost).
 *   4. Recompute conflict threatLevel using AI severity in the 7-day trailing window.
 *   5. Delete conflicts left with no classified events (no valid AI signal).
 *   6. Cluster newly classified events into Situation records.
 *
 * Run from apps/worker/:
 *   npx tsx scripts/backfill-reclassify.ts
 */
import 'dotenv/config'
import { prisma } from '@conflictwatch/db'
import { fetchBestLeadText } from '../src/pipeline/fetcher.js'
import { classifyCluster } from '../src/ai/enricher.js'
import { matchOrCreateSituation } from '../src/pipeline/cluster.js'

// ── Constants — must mirror persist.ts ──────────────────────────────────────
const ALLOWED_ROOT_CODES = new Set(['17', '18', '19', '20'])
const THREAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const MIN_EVENTS: Partial<Record<number, number>> = { 5: 15, 4: 5, 3: 3, 2: 2 }

// Cost cap: classify at most this many events per backfill run
const MAX_BACKFILL_CLASSIFY = 50

// ── Threat computation using AI severity (mirrors persist.ts) ────────────────
function computeThreat(events: { severity: number }[]): number {
  const counts = new Map<number, number>()
  for (const e of events) {
    counts.set(e.severity, (counts.get(e.severity) ?? 0) + 1)
  }
  const cumulative = new Map<number, number>()
  for (const [score, count] of counts) {
    for (let lvl = 1; lvl <= score; lvl++) {
      cumulative.set(lvl, (cumulative.get(lvl) ?? 0) + count)
    }
  }
  for (let s = 5; s >= 1; s--) {
    const count = cumulative.get(s) ?? 0
    if (count === 0) continue
    if (count < (MIN_EVENTS[s] ?? 1)) continue
    return s
  }
  return 1
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[backfill] Starting consolidated reclassification…')

  // Step 1: delete events with disallowed CAMEO root codes
  // (eventType field stores the string name; eventRootCode is on NormalizedEvent but
  //  not stored directly — use eventType allowlist derived from score.ts)
  const ALLOWED_TYPES = new Set(['coercion', 'assault', 'armed-conflict', 'mass-violence'])
  const disallowedEvents = await prisma.event.findMany({
    where: { eventType: { notIn: [...ALLOWED_TYPES] } },
    select: { id: true },
  })
  console.log(`[backfill] Step 1: ${disallowedEvents.length} events with disallowed types`)
  if (disallowedEvents.length > 0) {
    const ids = disallowedEvents.map(e => e.id)
    const { count: srcDel } = await prisma.eventSource.deleteMany({ where: { eventId: { in: ids } } })
    const { count: evtDel } = await prisma.event.deleteMany({ where: { id: { in: ids } } })
    console.log(`[backfill]   Deleted ${evtDel} events, ${srcDel} sources`)
  }

  // Step 2: delete self-referential events (actor1 == actor2)
  const selfRef = await prisma.event.findMany({
    where: { actor1: { not: null }, actor2: { not: null } },
    select: { id: true, actor1: true, actor2: true },
  })
  const selfRefIds = selfRef
    .filter(e => e.actor1 && e.actor2 && e.actor1 === e.actor2)
    .map(e => e.id)
  console.log(`[backfill] Step 2: ${selfRefIds.length} self-referential events`)
  if (selfRefIds.length > 0) {
    const { count: srcDel } = await prisma.eventSource.deleteMany({ where: { eventId: { in: selfRefIds } } })
    const { count: evtDel } = await prisma.event.deleteMany({ where: { id: { in: selfRefIds } } })
    console.log(`[backfill]   Deleted ${evtDel} events, ${srcDel} sources`)
  }

  // Step 3: batch re-classify unclassified events
  const unclassified = await prisma.event.findMany({
    where: { classified: false },
    select: {
      id: true,
      region: true,
      publishedAt: true,
      eventType: true,
      conflictId: true,
      actor1: true,
      actor2: true,
      sources: { select: { url: true }, take: 3 },
    },
    take: MAX_BACKFILL_CLASSIFY,
    orderBy: { publishedAt: 'desc' },
  })
  console.log(`[backfill] Step 3: ${unclassified.length} unclassified events (cap ${MAX_BACKFILL_CLASSIFY})`)

  let classified = 0
  let dropped = 0
  const newlyClassifiedIds: string[] = []

  for (const event of unclassified) {
    const urls = event.sources.map(s => s.url)
    const lead = await fetchBestLeadText(urls)
    if (!lead) { dropped++; continue }

    const result = await classifyCluster(lead, {
      location: event.region,
      date: event.publishedAt.toISOString().slice(0, 10),
      cameoCategory: event.eventType,
      sourceBreadth: urls.length,
    })

    if (!result || !result.include) { dropped++; continue }

    await prisma.event.update({
      where: { id: event.id },
      data: {
        title: result.title.slice(0, 90),
        severity: result.severity,
        significance: result.significance,
        category: result.category,
        stabilityImpact: result.stability_impact,
        locationConfidence: result.location_confidence,
        classified: true,
      },
    })
    classified++
    newlyClassifiedIds.push(event.id)
  }
  console.log(`[backfill] Step 3: classified ${classified}, dropped ${dropped}`)

  // Step 4: recompute threat for all conflicts using AI severity
  const conflicts = await prisma.conflict.findMany({ select: { id: true, name: true } })
  console.log(`[backfill] Step 4: recomputing threat for ${conflicts.length} conflicts`)
  const cutoff = new Date(Date.now() - THREAT_WINDOW_MS)
  let updated = 0

  for (const conflict of conflicts) {
    const events = await prisma.event.findMany({
      where: {
        conflictId: conflict.id,
        publishedAt: { gte: cutoff },
        confidence: { in: ['medium', 'high'] },
        locationConfidence: { not: 'low' },
        classified: true,
      },
      select: { severity: true },
    })
    const threatLevel = computeThreat(events)
    await prisma.conflict.update({ where: { id: conflict.id }, data: { threatLevel } })
    updated++
  }
  console.log(`[backfill] Step 4: updated ${updated} conflicts`)

  // Step 5: delete conflicts with no classified events
  let deleted = 0
  for (const conflict of conflicts) {
    const count = await prisma.event.count({
      where: { conflictId: conflict.id, classified: true },
    })
    if (count === 0) {
      const eventsToDelete = await prisma.event.findMany({
        where: { conflictId: conflict.id },
        select: { id: true },
      })
      const idsToDelete = eventsToDelete.map(e => e.id)
      if (idsToDelete.length > 0) {
        await prisma.eventSource.deleteMany({ where: { eventId: { in: idsToDelete } } })
        await prisma.event.deleteMany({ where: { id: { in: idsToDelete } } })
      }
      await prisma.conflict.delete({ where: { id: conflict.id } })
      deleted++
    }
  }
  console.log(`[backfill] Step 5: deleted ${deleted} conflicts with no classified events`)

  // Step 6: cluster newly classified events into situations
  if (newlyClassifiedIds.length > 0) {
    const toCluster = await prisma.event.findMany({
      where: { id: { in: newlyClassifiedIds } },
      select: {
        id: true,
        conflictId: true,
        region: true,
        actor1: true,
        actor2: true,
        eventType: true,
        publishedAt: true,
        severity: true,
      },
    })
    let clustered = 0
    for (const e of toCluster) {
      if (!e.conflictId) continue
      await matchOrCreateSituation({
        id: e.id,
        conflictId: e.conflictId,
        region: e.region,
        actor1: e.actor1,
        actor2: e.actor2,
        eventRootCode: e.eventType,
        publishedAt: e.publishedAt,
        severity: e.severity,
      }).catch(err => console.error(`[backfill] cluster failed for ${e.id}:`, err))
      clustered++
    }
    console.log(`[backfill] Step 6: clustered ${clustered} events into situations`)
  } else {
    console.log('[backfill] Step 6: no newly classified events to cluster')
  }

  console.log('[backfill] Done')
  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[backfill] Fatal:', err)
  process.exit(1)
})
