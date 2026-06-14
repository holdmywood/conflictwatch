import 'dotenv/config'
import cron from 'node-cron'
import { prisma } from '@conflictwatch/db'
import { GdeltSource } from './sources/gdelt.js'
import { isDuplicate, clusterExists } from './pipeline/deduplicate.js'
import {
  persistEvent,
  updateHeartbeat,
  accrueSourceToCluster,
  recomputeConflictThreat,
} from './pipeline/persist.js'
import { initTrustGate } from './pipeline/trust.js'
import { runUcdpPoll } from './pipeline/ucdp-poll.js'
import { fetchBestLeadText } from './pipeline/fetcher.js'
import { classifyCluster } from './ai/enricher.js'
import {
  runHourlyAssessments,
  runDailyReports,
  triggerAssessmentForConflict,
} from './ai/assessor.js'
import { matchOrCreateSituation, decayStaleSituations } from './pipeline/cluster.js'
import { enqueueCluster, drainPending, removePending } from './pipeline/pending-queue.js'
import { runAllEscalationPasses } from './pipeline/escalation.js'
import { resolveOutcomes } from './ai/episode-logger.js'
import { evaluateWatchlistRules } from './jobs/evaluateWatchlistRules.js'
import { checkStaleness } from './jobs/staleness-alert.js'
import { createCycleGuard } from './lib/run-guard.js'
import { getAndResetGeoDropCount } from './pipeline/normalize.js'
import type { NormalizedEvent } from './types.js'

const gdelt = new GdeltSource()

// Max new-cluster enrichments per 5-min cycle to cap cost spikes.
// Events beyond this are queued for the next cycle.
const MAX_ENRICH_PER_CYCLE = 20

// Circuit breaker: after this many classify failures in one cycle, stop
// attempting classifies (likely API outage / exhausted credits) and defer
// the remaining clusters untouched.
const MAX_CLASSIFY_FAILURES_PER_CYCLE = 5

// Group normalized events by their GDELT cluster (globalEventId).
function groupByCluster(events: NormalizedEvent[]): Map<string, NormalizedEvent[]> {
  const map = new Map<string, NormalizedEvent[]>()
  for (const e of events) {
    const group = map.get(e.globalEventId) ?? []
    group.push(e)
    map.set(e.globalEventId, group)
  }
  return map
}

// Return URLs ordered tier1 > tier2 > specialist > others for lead fetching.
function sortUrlsByTier(events: NormalizedEvent[]): string[] {
  const RANK: Record<string, number> = {
    tier1: 4, tier2: 3, specialist: 2, review: 1, unknown: 0, blocked: -1,
  }
  return [...events]
    .sort((a, b) => (RANK[b.sourceTier] ?? 0) - (RANK[a.sourceTier] ?? 0))
    .map(e => e.url)
}

async function runIngestionCycle(): Promise<void> {
  const start = Date.now()
  let sourcesOk = 0
  let sourcesFailed = 0
  let classifyCalls = 0

  try {
    console.log('[worker] ingestion cycle start')
    const events = await gdelt.fetch()
    console.log(`[worker] fetched ${events.length} events from GDELT (post trust-gate)`)

    const clusters = groupByCluster(events)

    // Deferred clusters from earlier over-cap cycles get priority over fresh
    // ones; a fresh mention of a queued cluster supersedes the stored payload.
    const pending = await drainPending(200)
    const attemptsByCluster = new Map<string, number>()
    const ordered = new Map<string, NormalizedEvent[]>()
    for (const entry of pending) {
      ordered.set(entry.clusterId, clusters.get(entry.clusterId) ?? entry.events)
      attemptsByCluster.set(entry.clusterId, entry.attempts)
    }
    for (const [clusterId, clusterEvents] of clusters) {
      if (!ordered.has(clusterId)) ordered.set(clusterId, clusterEvents)
    }

    // Conflicts whose evidence base changed this cycle — threat recomputes
    // once per conflict at cycle end, not once per event.
    const touchedConflicts = new Set<string>()
    let newCount = 0
    let accruedSources = 0
    let discardedNoFetch = 0
    let discardedExcluded = 0
    let classifyFailures = 0
    let enrichQueued = 0

    for (const [clusterId, clusterEvents] of ordered) {
      const firstEvent = clusterEvents[0]
      if (!firstEvent || !firstEvent.countryCode || isNaN(firstEvent.lat) || isNaN(firstEvent.lng)) continue

      const fromQueue = attemptsByCluster.has(clusterId)

      // Known cluster (already classified): new mentions are corroboration.
      // Accrue sources + cumulative confidence; never re-classify.
      const knownEventId = await clusterExists(clusterId)
      if (knownEventId) {
        for (const event of clusterEvents) {
          const dup = await isDuplicate(event.globalEventId, event.url)
          if (dup) continue
          const { accrued, conflictId, confidenceChanged } = await accrueSourceToCluster(event)
          if (accrued) accruedSources++
          // Confidence upgrades change the corroborated evidence base → threat must follow
          if (confidenceChanged && conflictId) touchedConflicts.add(conflictId)
        }
        if (fromQueue) await removePending(clusterId)
        continue
      }

      // New cluster: fetch lead + classify (gated by cycle cap).
      // Over-cap clusters are queued for later cycles, not dropped.
      if (classifyCalls >= MAX_ENRICH_PER_CYCLE || classifyFailures >= MAX_CLASSIFY_FAILURES_PER_CYCLE) {
        enrichQueued++
        await enqueueCluster(clusterId, clusterEvents, (attemptsByCluster.get(clusterId) ?? 0) + 1)
          .catch(err => console.error(`[worker] enqueue failed for ${clusterId}:`, err))
        continue
      }

      const urls = sortUrlsByTier(clusterEvents)
      const lead = await fetchBestLeadText(urls)
      if (!lead) {
        discardedNoFetch++
        if (fromQueue) await removePending(clusterId)
        console.log(`[worker] dropped cluster ${clusterId} — all sources failed to fetch`)
        continue
      }

      const allSources = clusterEvents.map(e => e.sourceName)
      const sourceBreadth = new Set(allSources).size

      const classify = await classifyCluster(lead, {
        location: firstEvent.region,
        date: firstEvent.publishedAt.toISOString().slice(0, 10),
        cameoCategory: firstEvent.eventRootCode,
        sourceBreadth,
      })
      classifyCalls++

      if (!classify) {
        // API/parse failure is NOT an exclusion verdict — defer the cluster
        // and retry next cycle. Attempts are NOT incremented for failures, so
        // an API outage cannot burn a cluster's retry budget; only over-cap
        // deferrals count against MAX_ATTEMPTS.
        classifyFailures++
        await enqueueCluster(clusterId, clusterEvents, attemptsByCluster.get(clusterId) ?? 0)
          .catch(err => console.error(`[worker] enqueue after classify failure failed for ${clusterId}:`, err))
        continue
      }
      if (!classify.include) {
        discardedExcluded++
        if (fromQueue) await removePending(clusterId)
        console.log(`[worker] excluded cluster ${clusterId} — ${classify.exclude_reason ?? 'no reason given'}`)
        continue
      }
      if (fromQueue) await removePending(clusterId)

      // Persist all mentions in this cluster
      for (const event of clusterEvents) {
        const dup = await isDuplicate(event.globalEventId, event.url)
        if (dup) continue

        const { conflictId, discarded, eventId } = await persistEvent(
          event, allSources, classify
        )
        if (discarded) continue

        newCount++
        touchedConflicts.add(conflictId)

        // Cluster event into a developing-story situation
        await matchOrCreateSituation({
          id: eventId,
          conflictId,
          region: event.region,
          actor1: event.actor1Name || null,
          actor2: event.actor2Name || null,
          eventRootCode: event.eventRootCode,
          publishedAt: event.publishedAt,
          severity: classify.severity,
        }).catch(err =>
          console.error(`[worker] situation clustering failed for event ${eventId}:`, err)
        )
      }
    }

    // Recompute threat once per touched conflict; a move of ≥2 levels in either
    // direction is a material change worth an immediate assessment.
    const jumpedConflictIds: string[] = []
    for (const cid of touchedConflicts) {
      try {
        const before = await prisma.conflict.findUnique({
          where: { id: cid },
          select: { threatLevel: true },
        })
        const after = await recomputeConflictThreat(cid)
        if (before && Math.abs(before.threatLevel - after) >= 2) {
          jumpedConflictIds.push(cid)
        }
      } catch (err) {
        console.error(`[worker] threat recompute failed for ${cid}:`, err)
      }
    }

    for (const cid of jumpedConflictIds) {
      await triggerAssessmentForConflict(cid).catch(err =>
        console.error(`[worker] threat-jump assessment failed for ${cid}:`, err)
      )
    }

    sourcesOk = 1
    const geoDrops = getAndResetGeoDropCount()
    if (geoDrops > 0) {
      console.warn(`[worker] ${geoDrops} rows dropped for unresolvable coordinates — centroid table may need curation`)
    }
    if (classifyFailures > 0) {
      console.error(
        `[worker] ${classifyFailures} classify calls FAILED this cycle — ` +
        'check ANTHROPIC_API_KEY/credits; affected clusters are deferred, not discarded'
      )
    }
    console.log(
      `[worker] done in ${Date.now() - start}ms — ` +
      `${newCount} new events, ${accruedSources} sources accrued, ` +
      `${discardedNoFetch} no-fetch, ${discardedExcluded} excluded, ` +
      `${classifyFailures} classify-failed (deferred), ` +
      `${enrichQueued} over-cap, ${classifyCalls} classify calls, ${geoDrops} geo-drops`
    )
  } catch (err) {
    sourcesFailed = 1
    console.error('[worker] ingestion error:', err)
  }

  await updateHeartbeat(sourcesOk, sourcesFailed, { classifyCalls })
}

// A cycle that outlives the hard limit is presumed hung — exit and let the
// platform restart a clean worker (Railway/systemd must be configured with
// restart-on-exit; a dead worker silently serving stale data is the worst case).
const CYCLE_HARD_LIMIT_MS = 15 * 60 * 1000
const STALENESS_THRESHOLD_MIN = parseInt(process.env.OPS_STALENESS_THRESHOLD_MIN ?? '30', 10)

const guardedIngestionCycle = createCycleGuard(runIngestionCycle, {
  hardLimitMs: CYCLE_HARD_LIMIT_MS,
})

async function main(): Promise<void> {
  // Crash posture: log and exit non-zero so the platform restarts us.
  // Never linger in an unknown state serving a stale heartbeat.
  process.on('uncaughtException', err => {
    console.error('[worker] uncaught exception — exiting for restart:', err)
    process.exit(1)
  })
  process.on('unhandledRejection', reason => {
    console.error('[worker] unhandled rejection — exiting for restart:', reason)
    process.exit(1)
  })

  // Warm the trust gate cache before the first ingest cycle
  await initTrustGate()

  await guardedIngestionCycle()

  const ingestionTask = cron.schedule('*/5 * * * *', guardedIngestionCycle)
  const hourlyTask = cron.schedule('0 * * * *', () =>
    runHourlyAssessments()
      .then(() => runAllEscalationPasses())
      .then(() => decayStaleSituations())
      .catch(err => console.error('[worker] hourly assessment error:', err))
  )
  const dailyTask = cron.schedule('0 0 * * *', () =>
    runDailyReports()
      .then(() => resolveOutcomes())
      .catch(err =>
        console.error('[worker] outcome resolution error:', err)
      )
  )
  const watchlistTask = cron.schedule('*/15 * * * *', () =>
    evaluateWatchlistRules().catch(err =>
      console.error('[worker] watchlist evaluation error:', err)
    )
  )
  const stalenessTask = cron.schedule('*/5 * * * *', () =>
    checkStaleness(STALENESS_THRESHOLD_MIN).catch(err =>
      console.error('[worker] staleness check error:', err)
    )
  )
  // Curated UCDP layer — weekly, Mondays 06:00 UTC (UCDP Candidate updates
  // ~monthly). Zero tokens: structured data, no classifier. Keeps multi-month
  // historical depth current so long-running conflicts don't decay to level 1.
  const ucdpTask = cron.schedule('0 6 * * 1', () =>
    runUcdpPoll().catch(err => console.error('[worker] UCDP poll error:', err))
  )
  console.log(
    '[worker] cron scheduled — polling every 5 min, assessments every hour, reports at midnight, ' +
    `UCDP poll weekly, staleness alert at ${STALENESS_THRESHOLD_MIN}min`
  )

  const shutdown = async () => {
    console.log('[worker] shutting down…')
    ingestionTask.stop()
    hourlyTask.stop()
    dailyTask.stop()
    watchlistTask.stop()
    stalenessTask.stop()
    ucdpTask.stop()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch(err => {
  console.error('[worker] fatal:', err)
  process.exit(1)
})
