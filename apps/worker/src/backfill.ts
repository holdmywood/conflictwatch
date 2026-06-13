// One-time historical backfill: replays the past week of GDELT 15-minute
// windows through the SAME trust-gate → classify → persist → accrue pipeline
// the live cycle uses, so country threat levels reflect a full 7-day window of
// corroborated evidence instead of only events since launch.
//
// Idempotent and resumable: already-classified clusters are skipped (sources
// still accrue), so a re-run continues where a previous run stopped. Bounded by
// a classify budget to cap Anthropic spend.
//
//   BACKFILL_DAYS=7 BACKFILL_CLASSIFY_BUDGET=1500 \
//   DATABASE_URL="<prod direct>" pnpm --filter worker exec tsx src/backfill.ts
//
// Reuses ANTHROPIC_API_KEY from the worker .env. Processes windows newest-first.

import 'dotenv/config'
import { prisma } from '@conflictwatch/db'
import { GdeltSource } from './sources/gdelt.js'
import { recentWindows } from './lib/backfill-windows.js'
import { isDuplicate, clusterExists } from './pipeline/deduplicate.js'
import { persistEvent, accrueSourceToCluster, recomputeConflictThreat } from './pipeline/persist.js'
import { initTrustGate } from './pipeline/trust.js'
import { fetchBestLeadText } from './pipeline/fetcher.js'
import { classifyCluster } from './ai/enricher.js'
import type { NormalizedEvent } from './types.js'

const DAYS = Number(process.env.BACKFILL_DAYS ?? 7)
const BUDGET = Number(process.env.BACKFILL_CLASSIFY_BUDGET ?? 1500)

// Skip per-mention domain-usage upserts: processing a week of windows back-to-back
// would otherwise flood the connection pool with un-awaited writes.
process.env.WORKER_SKIP_DOMAIN_USAGE = '1'

// Same source-tier ordering the live cycle uses for lead selection.
function sortUrlsByTier(events: NormalizedEvent[]): string[] {
  const RANK: Record<string, number> = {
    tier1: 4, tier2: 3, specialist: 2, review: 1, unknown: 0, blocked: -1,
  }
  return [...events]
    .sort((a, b) => (RANK[b.sourceTier] ?? 0) - (RANK[a.sourceTier] ?? 0))
    .map(e => e.url)
}

function groupByCluster(events: NormalizedEvent[]): Map<string, NormalizedEvent[]> {
  const map = new Map<string, NormalizedEvent[]>()
  for (const e of events) {
    const group = map.get(e.globalEventId) ?? []
    group.push(e)
    map.set(e.globalEventId, group)
  }
  return map
}

async function main(): Promise<void> {
  const dbHost = (process.env.DATABASE_URL ?? '').replace(/:[^:@/]*@/, ':***@').replace(/^.*@/, '')
  console.log(`[backfill] target DB host: ${dbHost || '(unset!)'}`)
  console.log(`[backfill] days=${DAYS} classifyBudget=${BUDGET}`)

  await initTrustGate()
  const gdelt = new GdeltSource()
  const windows = recentWindows(new Date(), DAYS)
  const touched = new Set<string>()
  let classifyUsed = 0
  let newEvents = 0
  let accrued = 0
  let processedWindows = 0
  let missingWindows = 0

  for (const ts of windows) {
    if (classifyUsed >= BUDGET) break

    let events: NormalizedEvent[]
    try {
      events = await gdelt.fetchWindow(ts)
    } catch {
      missingWindows++ // GDELT occasionally has gaps; skip
      continue
    }

    for (const [clusterId, clusterEvents] of groupByCluster(events)) {
      const firstEvent = clusterEvents[0]
      if (!firstEvent || !firstEvent.countryCode || isNaN(firstEvent.lat) || isNaN(firstEvent.lng)) continue

      // Known cluster: new mentions are corroboration → accrue, never re-classify.
      const knownEventId = await clusterExists(clusterId)
      if (knownEventId) {
        for (const event of clusterEvents) {
          if (await isDuplicate(event.globalEventId, event.url)) continue
          const { accrued: didAccrue, conflictId, confidenceChanged } = await accrueSourceToCluster(event)
          if (didAccrue) accrued++
          if (confidenceChanged && conflictId) touched.add(conflictId)
        }
        continue
      }

      // New cluster: classify once (budget-gated), then persist all mentions.
      if (classifyUsed >= BUDGET) continue
      const lead = await fetchBestLeadText(sortUrlsByTier(clusterEvents))
      if (!lead) continue

      const allSources = clusterEvents.map(e => e.sourceName)
      const classify = await classifyCluster(lead, {
        location: firstEvent.region,
        date: firstEvent.publishedAt.toISOString().slice(0, 10),
        cameoCategory: firstEvent.eventRootCode,
        sourceBreadth: new Set(allSources).size,
      })
      classifyUsed++
      if (!classify || !classify.include) continue

      for (const event of clusterEvents) {
        if (await isDuplicate(event.globalEventId, event.url)) continue
        const { conflictId, discarded } = await persistEvent(event, allSources, classify)
        if (!discarded) {
          newEvents++
          touched.add(conflictId)
        }
      }
    }

    processedWindows++
    if (processedWindows % 10 === 0) {
      console.log(
        `[backfill] window ${ts} | processed=${processedWindows} missing=${missingWindows} ` +
        `classify=${classifyUsed}/${BUDGET} newEvents=${newEvents} accrued=${accrued} conflicts=${touched.size}`,
      )
    }
  }

  console.log(`[backfill] recomputing threat for ${touched.size} conflicts…`)
  for (const cId of touched) {
    try {
      await recomputeConflictThreat(cId)
    } catch (err) {
      console.error(`[backfill] threat recompute failed for ${cId}:`, err)
    }
  }

  console.log(
    `[backfill] DONE — windows=${processedWindows} missing=${missingWindows} ` +
    `classifyUsed=${classifyUsed} newEvents=${newEvents} accrued=${accrued} conflicts=${touched.size}`,
  )
  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[backfill] fatal:', err)
  process.exit(1)
})
