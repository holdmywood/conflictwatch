import { prisma } from '@conflictwatch/db'

const BASELINE_WINDOW_DAYS = 30

/**
 * Compute the novelty score for a new event relative to recent baseline.
 *
 * Novelty = (severity - baselineMean) / max(1, baselineStdDev)
 * Clipped to [-5, 5]. Returns 0 when no prior baseline exists.
 *
 * Point-in-time safe: only reads events published before `asOf`.
 */
export async function computeNoveltyScore(
  conflictId: string,
  severity: number,
  asOf: Date,
): Promise<number> {
  const windowStart = new Date(asOf.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const events = await prisma.event.findMany({
    where: {
      conflictId,
      classified: true,
      publishedAt: {
        gte: windowStart,
        lt: asOf,
      },
    },
    select: { severity: true },
  })

  if (events.length === 0) return 0

  const severities = events.map((e) => e.severity)
  const mean = severities.reduce((sum, s) => sum + s, 0) / severities.length

  const variance =
    severities.reduce((sum, s) => sum + (s - mean) ** 2, 0) / severities.length
  const stdDev = Math.sqrt(variance)

  const raw = (severity - mean) / Math.max(1, stdDev)

  return Math.min(5, Math.max(-5, raw))
}

/**
 * Compute coverage-gap score.
 *
 * High severity combined with few independent sources = potential edge case.
 * coverageGapScore = severity * (1 - min(1, independentSourceCount / 5))
 * Range: 0–5. Higher = more concerning (high severity, thin coverage).
 */
export function computeCoverageGapScore(
  severity: number,
  independentSourceCount: number,
): number {
  return severity * (1 - Math.min(1, independentSourceCount / 5))
}
