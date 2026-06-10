/**
 * EpisodeStore + CalibrationRecord logging.
 *
 * This module starts the track record from the moment it is deployed.
 * Calibration and the analogue engine require history that can only be built
 * forward — there is no retroactive substitute.
 *
 * Flow:
 *   1. snapshotEpisode()     — called when an EscalationSignal is created;
 *                              captures the point-in-time feature vector.
 *   2. logCalibration()      — stores the probabilistic call alongside the signal.
 *   3. resolveOutcomes()     — cron job; checks unresolved signals past their
 *                              horizon and marks them resolved (true/false),
 *                              computes Brier score.
 *
 * Point-in-time guarantee: only features knowable AT signal time are stored.
 * Outcomes use as-reported data only — never hindsight-corrected values.
 */

import { prisma } from '@conflictwatch/db'

export interface EpisodeFeatures {
  conflictId: string
  eventTempo: number       // events/day in trailing window
  severitySlope: number    // Δavg-severity over window (positive = rising)
  spreadLocations: number  // distinct location count in window
  sourceBreadth: number    // independent tier1/tier2/specialist sources
  actorCount: number       // distinct named actors
  geographyClass: string   // 'chokepoint-adj'|'landlocked'|'coastal'|'island'|''
  actorTypes: string[]     // 'state'|'insurgent'|'militia'|'criminal'
  chokepoints: string[]
  commodityTags: string[]
  usedEventIds: string[]
}

// Create an EpisodeStore snapshot when a signal is generated.
// Returns the episode ID for linking to EscalationSignal.
export async function snapshotEpisode(features: EpisodeFeatures): Promise<string> {
  const episode = await prisma.episodeStore.create({
    data: {
      conflictId: features.conflictId,
      snapshotAt: new Date(),
      eventTempo: features.eventTempo,
      severitySlope: features.severitySlope,
      spreadLocations: features.spreadLocations,
      sourceBreadth: features.sourceBreadth,
      actorCount: features.actorCount,
      geographyClass: features.geographyClass,
      actorTypes: features.actorTypes,
      chokepoints: features.chokepoints,
      commodityTags: features.commodityTags,
      usedEventIds: features.usedEventIds,
    },
  })
  return episode.id
}

// Log a calibration record when a probabilistic escalation call is made.
// Must be called for EVERY signal that carries pEscalation — this is the
// record that makes the track record auditable.
export async function logCalibration(
  signalId: string,
  pEscalation: number,
  ciLow: number,
  ciHigh: number,
  horizonDays: number,
  modelVersion: string,
): Promise<void> {
  await prisma.calibrationRecord.create({
    data: {
      signalId,
      pEscalation,
      ciLow,
      ciHigh,
      horizonDays,
      modelVersion,
    },
  })
}

// Resolve outcomes for signals whose horizon has passed.
// Runs on a scheduled basis (daily recommended).
// 'escalated' is determined by: did the conflictId's threatLevel reach ≥4
// within horizonDays of the signal's computedAt?
// This is a simple proxy for "national-level escalation" until a richer
// ground-truth source (ACLED, news verification) is wired in.
export async function resolveOutcomes(): Promise<void> {
  const now = new Date()

  // Find unresolved calibration records past their horizon
  const pending = await prisma.calibrationRecord.findMany({
    where: { resolvedAt: null },
    include: { signal: true },
  })

  let resolved = 0
  for (const record of pending) {
    const horizonMs = record.horizonDays * 24 * 60 * 60 * 1000
    const resolutionDue = new Date(record.computedAt.getTime() + horizonMs)
    if (resolutionDue > now) continue // not yet past horizon

    const signal = record.signal
    // Escalation outcome: a severity ≥4 corroborated event whose *event time*
    // (publishedAt) falls inside the horizon window. ingestedAt must not be
    // used here — late ingestion of an old event would count hindsight as
    // outcome, and the published methodology defines the outcome by event time.
    // Resolution sees only what is in the DB at resolution time (forward-only).
    const escalationEvent = await prisma.event.findFirst({
      where: {
        conflictId: signal.targetId,
        publishedAt: {
          gte: signal.computedAt,
          lte: resolutionDue,
        },
        severity: { gte: 4 },
        confidence: { in: ['medium', 'high'] },
      },
    })

    const actualOutcome = escalationEvent !== null
    const brierScore = Math.pow(record.pEscalation - (actualOutcome ? 1 : 0), 2)

    await prisma.calibrationRecord.update({
      where: { id: record.id },
      data: { resolvedAt: now, actualOutcome, brierScore },
    })

    // Mirror outcome onto EscalationSignal and EpisodeStore
    await prisma.escalationSignal.update({
      where: { id: signal.id },
      data: { resolvedOutcome: actualOutcome, resolvedAt: now },
    })

    if (signal.episodeId) {
      await prisma.episodeStore.update({
        where: { id: signal.episodeId },
        data: {
          escalatedToNational: actualOutcome,
          escalationHorizonDays: record.horizonDays,
        },
      })
    }

    resolved++
  }

  if (resolved > 0) {
    console.log(`[episode-logger] resolved ${resolved} calibration records`)
  }
}
