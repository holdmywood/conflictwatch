import { prisma } from '@conflictwatch/db'

export interface AnalogueFeatures {
  eventTempo: number
  severitySlope: number
  spreadLocations: number
  sourceBreadth: number
  actorCount: number
}

export interface Analogue {
  episodeId: string
  conflictId: string
  snapshotAt: Date
  distance: number          // 0 = identical, higher = more different
  escalatedToNational: boolean
  horizonDays: number | null
  assetMovesJson: unknown   // raw from DB
}

export interface AnalogueResult {
  analogues: Analogue[]
  baseRate: number          // fraction that escalated among top-N
  dispersion: number        // std dev of escalation rate within top-N
  totalCandidates: number   // episodes in the search pool
}

// Feature scaling factors — normalize each dimension to [0,1] range
// based on expected operational ranges. Keeps distance metric balanced.
const SCALE: Record<keyof AnalogueFeatures, number> = {
  eventTempo: 1 / 20,
  severitySlope: 1 / 5,
  spreadLocations: 1 / 20,
  sourceBreadth: 1 / 10,
  actorCount: 1 / 20,
}

function euclideanDistance(a: AnalogueFeatures, b: AnalogueFeatures): number {
  return Math.sqrt(
    Object.keys(SCALE).reduce((sum, key) => {
      const k = key as keyof AnalogueFeatures
      return sum + Math.pow((a[k] - b[k]) * SCALE[k], 2)
    }, 0)
  )
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
    distance: euclideanDistance(features, {
      eventTempo: ep.eventTempo,
      severitySlope: ep.severitySlope,
      spreadLocations: ep.spreadLocations,
      sourceBreadth: ep.sourceBreadth,
      actorCount: ep.actorCount,
    }),
    escalatedToNational: ep.escalatedToNational ?? false,
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
