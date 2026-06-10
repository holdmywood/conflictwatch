import { prisma } from '@conflictwatch/db'
import { toEventType, scoreConfidence } from './score.js'
import { buildTitle } from './normalize.js'
import { computeCoverageGapScore } from './surprise.js'
import type { NormalizedEvent } from '../types.js'
import type { ClassifyResult } from '../ai/enricher.js'

// Trailing window for threat aggregation (7 days).
const THREAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Minimum corroborated (medium/high confidence, locationConfidence != low) events
// at each cumulative level to reach that threat score.
//   5/5 = 15+ corroborated high-severity events (sustained armed conflict)
//   4/5 = 5+  repeated serious incidents
//   3/5 = 3+  corroborated pattern
//   2/5 = 2+  isolated corroborated event
const MIN_EVENTS: Partial<Record<number, number>> = { 5: 15, 4: 5, 3: 3, 2: 2 }

// Cumulative threat aggregation over AI severity scores (1–5).
// Uses event.severity (from AI classify) directly — no CAMEO mapping.
// Only medium/high confidence events with non-low locationConfidence count.
async function computeConflictThreat(cId: string): Promise<number> {
  const cutoff = new Date(Date.now() - THREAT_WINDOW_MS)
  const events = await prisma.event.findMany({
    where: {
      conflictId: cId,
      publishedAt: { gte: cutoff },
      confidence: { in: ['medium', 'high'] },
      locationConfidence: { not: 'low' },
      classified: true,
    },
    select: { severity: true },
  })

  const counts = new Map<number, number>()
  for (const e of events) {
    const s = e.severity
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }

  // Build cumulative counts: an event at severity S contributes to all levels ≤ S
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

function conflictId(countryCode: string): string {
  return `conflict-${countryCode.toLowerCase()}`
}

// Recompute and store the threat level for a conflict from current evidence.
// Exported for callers that change the evidence base outside persistEvent
// (e.g. source accrual upgrading confidence).
export async function recomputeConflictThreat(cId: string): Promise<number> {
  const level = await computeConflictThreat(cId)
  await prisma.conflict.update({
    where: { id: cId },
    data: { threatLevel: level },
  })
  return level
}

const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 }

// Record a newly seen source URL on an already-classified cluster and
// recompute confidence cumulatively from ALL sources in the DB.
// Confidence never moves down: a thin later batch must not erase corroboration.
// No LLM call — new mentions of a known event are corroboration, not new signal.
export async function accrueSourceToCluster(
  event: NormalizedEvent,
): Promise<{ accrued: boolean; conflictId: string | null; confidenceChanged: boolean }> {
  const existing = await prisma.event.findUnique({
    where: { clusterId: event.globalEventId },
    select: { id: true, confidence: true, conflictId: true },
  })
  if (!existing) return { accrued: false, conflictId: null, confidenceChanged: false }

  await prisma.eventSource.upsert({
    where: { eventId_url: { eventId: existing.id, url: event.url } },
    create: {
      eventId: existing.id,
      name: event.sourceName,
      url: event.url,
      publishedAt: event.publishedAt,
    },
    update: {},
  })

  const allSources = await prisma.eventSource.findMany({
    where: { eventId: existing.id },
    select: { name: true },
  })
  const cumulative = scoreConfidence(allSources.map(s => s.name))

  const confidenceChanged =
    (CONFIDENCE_RANK[cumulative] ?? 0) > (CONFIDENCE_RANK[existing.confidence] ?? 0)
  if (confidenceChanged) {
    await prisma.event.update({
      where: { id: existing.id },
      data: { confidence: cumulative },
    })
  }

  return { accrued: true, conflictId: existing.conflictId, confidenceChanged }
}

export async function persistEvent(
  event: NormalizedEvent,
  allSourceNamesForCluster: string[],
  classify?: ClassifyResult,
): Promise<{ threatLevelJumped: boolean; conflictId: string; discarded: boolean; eventId: string }> {
  // Events without classification or classified-exclude are discarded
  if (!classify || !classify.include) {
    return { threatLevelJumped: false, conflictId: '', discarded: true, eventId: '' }
  }

  const eventType = toEventType(event.eventRootCode)
  const confidence = scoreConfidence(allSourceNamesForCluster)

  // Title comes from AI; buildTitle is the fallback for unenriched events (backfill only)
  const title = classify.title

  const cId = conflictId(event.countryCode)

  const existing = await prisma.conflict.findUnique({
    where: { id: cId },
    select: { threatLevel: true },
  })

  await prisma.conflict.upsert({
    where: { id: cId },
    create: {
      id: cId,
      name: event.region.split(',').pop()?.trim() ?? event.countryCode,
      region: event.countryCode,
      status: 'active',
      threatLevel: classify.severity,
      lat: event.lat,
      lng: event.lng,
    },
    update: {
      lat: event.lat,
      lng: event.lng,
      status: 'active',
    },
  })

  const distinctDomainCount = new Set(allSourceNamesForCluster).size
  const surpriseScore = computeCoverageGapScore(classify.severity, distinctDomainCount)
  const now = new Date()

  const eventRecord = await prisma.event.upsert({
    where: { clusterId: event.globalEventId },
    create: {
      clusterId: event.globalEventId,
      title,
      actor1: event.actor1Name || null,
      actor2: event.actor2Name || null,
      eventType,
      lat: event.lat,
      lng: event.lng,
      region: event.region,
      confidence,
      publishedAt: event.publishedAt,
      conflictId: cId,
      // AI classify fields
      severity: classify.severity,
      significance: classify.significance,
      category: classify.category,
      stabilityImpact: classify.stability_impact,
      sourceTier: event.sourceTier,
      locationConfidence: classify.location_confidence,
      classified: true,
      // §12 / §A5: set only on first classification
      firstReportAt: event.publishedAt,
      signalAt: now,
      surpriseScore,
    },
    update: {
      title,
      actor1: event.actor1Name || null,
      actor2: event.actor2Name || null,
      // confidence deliberately not updated here: it only moves via
      // accrueSourceToCluster, cumulatively — a thin batch must not downgrade it
      // Re-classify updates these fields on re-ingest
      severity: classify.severity,
      significance: classify.significance,
      category: classify.category,
      stabilityImpact: classify.stability_impact,
      locationConfidence: classify.location_confidence,
    },
  })

  const computedThreat = await computeConflictThreat(cId)
  await prisma.conflict.update({
    where: { id: cId },
    data: { threatLevel: computedThreat },
  })

  await prisma.eventSource.upsert({
    where: { eventId_url: { eventId: eventRecord.id, url: event.url } },
    create: {
      eventId: eventRecord.id,
      name: event.sourceName,
      url: event.url,
      publishedAt: event.publishedAt,
    },
    update: {},
  })

  const threatLevelJumped =
    existing !== null && Math.abs(existing.threatLevel - computedThreat) >= 2

  return { threatLevelJumped, conflictId: cId, discarded: false, eventId: eventRecord.id }
}

export async function updateHeartbeat(
  sourcesOk: number,
  sourcesFailed: number,
  telemetry: { classifyCalls?: number; escalationCalls?: number; summaryCalls?: number } = {},
): Promise<void> {
  await prisma.heartbeat.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      lastIngestedAt: new Date(),
      sourcesOk,
      sourcesFailed,
      classifyCalls: telemetry.classifyCalls ?? 0,
      escalationCalls: telemetry.escalationCalls ?? 0,
      summaryCalls: telemetry.summaryCalls ?? 0,
    },
    update: {
      lastIngestedAt: new Date(),
      sourcesOk,
      sourcesFailed,
      classifyCalls: telemetry.classifyCalls ?? 0,
      escalationCalls: telemetry.escalationCalls ?? 0,
      summaryCalls: telemetry.summaryCalls ?? 0,
    },
  })
}

// Kept for backfill use only — not called in live pipeline
export { buildTitle }
