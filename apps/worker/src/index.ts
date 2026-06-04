import 'dotenv/config'
import cron from 'node-cron'
import { GdeltSource } from './sources/gdelt.js'
import { isDuplicate } from './pipeline/deduplicate.js'
import { persistEvent, updateHeartbeat } from './pipeline/persist.js'
import { initTrustGate } from './pipeline/trust.js'
import { fetchBestLeadText } from './pipeline/fetcher.js'
import { classifyCluster } from './ai/enricher.js'
import {
  runHourlyAssessments,
  runDailyReports,
  triggerAssessmentForConflict,
} from './ai/assessor.js'
import { matchOrCreateSituation } from './pipeline/cluster.js'
import { runAllEscalationPasses } from './pipeline/escalation.js'
import { resolveOutcomes } from './ai/episode-logger.js'
import { evaluateWatchlistRules } from './jobs/evaluateWatchlistRules.js'
import type { NormalizedEvent } from './types.js'

const gdelt = new GdeltSource()

// Max new-cluster enrichments per 5-min cycle to cap cost spikes.
// Events beyond this are queued for the next cycle.
const MAX_ENRICH_PER_CYCLE = 20

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
    const jumpedConflictIds = new Set<string>()
    let newCount = 0
    let discardedNoFetch = 0
    let discardedExcluded = 0
    let enrichQueued = 0

    for (const [clusterId, clusterEvents] of clusters) {
      const firstEvent = clusterEvents[0]
      if (!firstEvent || !firstEvent.countryCode || isNaN(firstEvent.lat) || isNaN(firstEvent.lng)) continue

      // Check if this cluster already exists in DB (already classified on prior ingest)
      const isKnownCluster = await isDuplicate(clusterId, clusterEvents[0].url)

      // For new clusters: fetch lead + classify (gated by cycle cap)
      let classify = undefined
      if (!isKnownCluster) {
        if (classifyCalls >= MAX_ENRICH_PER_CYCLE) {
          enrichQueued++
          continue
        }

        const urls = sortUrlsByTier(clusterEvents)
        const lead = await fetchBestLeadText(urls)
        if (!lead) {
          discardedNoFetch++
          console.log(`[worker] dropped cluster ${clusterId} — all sources failed to fetch`)
          continue
        }

        const allSources = clusterEvents.map(e => e.sourceName)
        const sourceBreadth = new Set(allSources).size

        classify = await classifyCluster(lead, {
          location: firstEvent.region,
          date: firstEvent.publishedAt.toISOString().slice(0, 10),
          cameoCategory: firstEvent.eventRootCode,
          sourceBreadth,
        })
        classifyCalls++

        if (!classify || !classify.include) {
          discardedExcluded++
          console.log(
            `[worker] excluded cluster ${clusterId} — ${classify?.exclude_reason ?? 'classify failed'}`
          )
          continue
        }
      }

      // Persist all mentions in this cluster
      const allSources = clusterEvents.map(e => e.sourceName)
      for (const event of clusterEvents) {
        const dup = await isDuplicate(event.globalEventId, event.url)
        if (dup) continue

        const { threatLevelJumped, conflictId, discarded, eventId } = await persistEvent(
          event, allSources, classify
        )
        if (discarded) continue

        newCount++
        if (threatLevelJumped) jumpedConflictIds.add(conflictId)

        // Cluster event into a developing-story situation
        await matchOrCreateSituation({
          id: eventId,
          conflictId,
          region: event.region,
          actor1: event.actor1Name || null,
          actor2: event.actor2Name || null,
          eventRootCode: event.eventRootCode,
          publishedAt: event.publishedAt,
          severity: classify?.severity ?? 1,
        }).catch(err =>
          console.error(`[worker] situation clustering failed for event ${eventId}:`, err)
        )
      }
    }

    for (const cid of jumpedConflictIds) {
      await triggerAssessmentForConflict(cid).catch(err =>
        console.error(`[worker] threat-jump assessment failed for ${cid}:`, err)
      )
    }

    sourcesOk = 1
    console.log(
      `[worker] done in ${Date.now() - start}ms — ` +
      `${newCount} new events, ${discardedNoFetch} no-fetch, ` +
      `${discardedExcluded} excluded, ${enrichQueued} queued, ` +
      `${classifyCalls} classify calls`
    )
  } catch (err) {
    sourcesFailed = 1
    console.error('[worker] ingestion error:', err)
  }

  await updateHeartbeat(sourcesOk, sourcesFailed, { classifyCalls })
}

async function main(): Promise<void> {
  // Warm the trust gate cache before the first ingest cycle
  await initTrustGate()

  await runIngestionCycle()

  const ingestionTask = cron.schedule('*/5 * * * *', runIngestionCycle)
  const hourlyTask = cron.schedule('0 * * * *', () =>
    runHourlyAssessments()
      .then(() => runAllEscalationPasses())
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
  console.log(
    '[worker] cron scheduled — polling every 5 min, assessments every hour, reports at midnight'
  )

  const shutdown = async () => {
    console.log('[worker] shutting down…')
    ingestionTask.stop()
    hourlyTask.stop()
    dailyTask.stop()
    watchlistTask.stop()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch(err => {
  console.error('[worker] fatal:', err)
  process.exit(1)
})
