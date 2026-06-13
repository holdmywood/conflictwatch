import { prisma, threatFromSeverities, THREAT_WINDOW_MS } from '@conflictwatch/db'
import { toEventType, scoreConfidence } from './score.js'
import { buildTitle } from './normalize.js'
import { computeCoverageGapScore } from './surprise.js'
import type { NormalizedEvent } from '../types.js'
import { resolveLocation, type ClassifyResult } from '../ai/enricher.js'

// Cumulative threat aggregation over AI severity scores (1–5).
// The aggregation rule lives in @conflictwatch/db (threatFromSeverities) so
// the web replay API recomputes history with identical logic. Only
// medium/high confidence events with non-low locationConfidence count.
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
  return threatFromSeverities(events.map(e => e.severity))
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
): Promise<{ conflictId: string; discarded: boolean; eventId: string }> {
  // Events without classification or classified-exclude are discarded
  if (!classify || !classify.include) {
    return { conflictId: '', discarded: true, eventId: '' }
  }

  const eventType = toEventType(event.eventRootCode)
  const confidence = scoreConfidence(allSourceNamesForCluster)

  // Title comes from AI; buildTitle is the fallback for unenriched events (backfill only)
  const title = classify.title

  // Authoritative location: the AI corrects GDELT's frequently-wrong geocoding
  // when it is highly confident. Country-level grouping (cId) still keys off
  // GDELT's country code — correcting that requires the AI to emit a country
  // code and is a separate change.
  const loc = resolveLocation(
    { lat: event.lat, lng: event.lng, region: event.region },
    classify,
  )

  const cId = conflictId(event.countryCode)

  await prisma.conflict.upsert({
    where: { id: cId },
    create: {
      id: cId,
      name: loc.region.split(',').pop()?.trim() ?? event.countryCode,
      region: event.countryCode,
      status: 'active',
      // Threat comes only from sustained corroborated evidence
      // (recomputeConflictThreat at cycle end) — never from one event.
      threatLevel: 1,
      lat: loc.lat,
      lng: loc.lng,
    },
    update: {
      lat: loc.lat,
      lng: loc.lng,
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
      lat: loc.lat,
      lng: loc.lng,
      region: loc.region,
      confidence,
      publishedAt: event.publishedAt,
      conflictId: cId,
      // AI classify fields
      severity: classify.severity,
      significance: classify.significance,
      category: classify.category,
      stabilityImpact: classify.stability_impact,
      sourceTier: event.sourceTier,
      locationConfidence: loc.locationConfidence,
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
      region: loc.region,
      lat: loc.lat,
      lng: loc.lng,
      locationConfidence: loc.locationConfidence,
    },
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

  return { conflictId: cId, discarded: false, eventId: eventRecord.id }
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
