import { prisma, analogueDistance, type AnalogueFeatures } from '@conflictwatch/db'

export type { AnalogueFeatures }

export interface Analogue {
  episodeId: string
  conflictId: string
  snapshotAt: Date
  distance: number          // 0 = identical, higher = more different
  escalatedToNational: boolean | null
  horizonDays: number | null
  assetMovesJson: unknown   // raw from DB
}

export interface AnalogueResult {
  analogues: Analogue[]
  baseRate: number          // fraction that escalated among top-N
  dispersion: number        // std dev of escalation rate within top-N
  totalCandidates: number   // episodes in the search pool
}

// Find the N most similar historical episodes to the given feature vector.
// Strictly point-in-time: only episodes with snapshotAt < asOfDate are candidates.
// Only episodes with resolved outcomes (escalatedToNational IS NOT NULL) are used
// for base-rate computation — unresolved episodes are included in analogues but
// flagged with null outcome.
export async function findAnalogues(
  features: AnalogueFeatures,
  asOfDate: Date,
  topN: number = 10,
): Promise<AnalogueResult> {
  if (asOfDate > new Date()) {
    throw new Error(`[analogue-engine] asOfDate ${asOfDate.toISOString()} is in the future`)
  }

  const candidates = await prisma.episodeStore.findMany({
    where: { snapshotAt: { lt: asOfDate } },
    select: {
      id: true,
      conflictId: true,
      snapshotAt: true,
      eventTempo: true,
      severitySlope: true,
      spreadLocations: true,
      sourceBreadth: true,
      actorCount: true,
      escalatedToNational: true,
      escalationHorizonDays: true,
      assetMovesJson: true,
    },
  })

  const totalCandidates = candidates.length

  // Compute distance for each candidate
  const scored = candidates.map(ep => ({
    episodeId: ep.id,
    conflictId: ep.conflictId,
    snapshotAt: ep.snapshotAt,
    distance: analogueDistance(features, {
      eventTempo: ep.eventTempo,
      severitySlope: ep.severitySlope,
      spreadLocations: ep.spreadLocations,
      sourceBreadth: ep.sourceBreadth,
      actorCount: ep.actorCount,
    }),
    escalatedToNational: ep.escalatedToNational,
    horizonDays: ep.escalationHorizonDays,
    assetMovesJson: ep.assetMovesJson,
  }))

  // Sort ascending by distance; take top-N
  scored.sort((a, b) => a.distance - b.distance)
  const topAnalogues = scored.slice(0, topN)

  // Base rate: fraction that escalated among top-N with resolved outcomes
  const resolved = topAnalogues.filter(a => a.escalatedToNational !== null)
  const escalatedCount = resolved.filter(a => a.escalatedToNational).length
  const baseRate = resolved.length > 0 ? escalatedCount / resolved.length : 0

  // Dispersion: std dev of binary outcomes within top-N
  const mean = baseRate
  const variance = resolved.length > 1
    ? resolved.reduce((s, a) => s + Math.pow((a.escalatedToNational ? 1 : 0) - mean, 2), 0) / resolved.length
    : 0
  const dispersion = Math.sqrt(variance)

  return {
    analogues: topAnalogues,
    baseRate: Math.round(baseRate * 100) / 100,
    dispersion: Math.round(dispersion * 100) / 100,
    totalCandidates,
  }
}
