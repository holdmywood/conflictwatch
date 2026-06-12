/**
 * Source verification + intelligence confidence framework.
 *
 * Deterministic and fully explainable: every level and every score is
 * computed from observable inputs (independent source count, best source
 * tier, recency, verification level) and ships with the reasons that
 * produced it. No LLM, no hidden weighting — the formulas are documented on
 * the methodology page and every badge can show its work.
 *
 * Note on 'rumor': the ingest trust gate rejects clusters with no
 * tier1/tier2/specialist source, so rumor-grade items normally never enter
 * the platform. The level exists for completeness and for any future source
 * class that bypasses the gate.
 */

export type VerificationLevel = 'verified' | 'multiple-sources' | 'unconfirmed' | 'rumor'
export type ConfidenceCategory =
  | 'Very high confidence'
  | 'High confidence'
  | 'Moderate confidence'
  | 'Low confidence'
  | 'Very low confidence'

export interface Verification {
  level: VerificationLevel
  label: string
  independentSources: number
  confidence: number // 0–100
  confidenceCategory: ConfidenceCategory
  reasons: string[]
  updatedAt: string
}

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  verified: 'Verified',
  'multiple-sources': 'Multiple sources',
  unconfirmed: 'Unconfirmed',
  rumor: 'Rumor',
}

/* Wire-syndication collapse — mirrors the worker's canonicalization
   (apps/worker/src/pipeline/score.ts) so the UI counts independence the same
   way the pipeline does. */
const WIRE_AGENCIES = [
  'reuters', 'associated press', ' ap ', 'afp', 'agence france',
  'xinhua', 'tass', 'bloomberg', 'dpa', 'apa ',
]

function canonicalSourceName(raw: string): string {
  const lower = raw.toLowerCase()
  for (const wire of WIRE_AGENCIES) {
    if (lower.includes(wire)) return wire.trim().split(' ')[0]
  }
  return lower
}

export function countIndependentSources(names: string[]): number {
  return new Set(names.map(canonicalSourceName)).size
}

export function confidenceCategory(score: number): ConfidenceCategory {
  if (score >= 90) return 'Very high confidence'
  if (score >= 75) return 'High confidence'
  if (score >= 60) return 'Moderate confidence'
  if (score >= 40) return 'Low confidence'
  return 'Very low confidence'
}

function recencyPoints(updatedAt: Date, now: Date): { points: number; label: string } {
  const hours = Math.max(0, (now.getTime() - updatedAt.getTime()) / 3_600_000)
  if (hours <= 6) return { points: 20, label: `updated ${Math.round(hours)}h ago` }
  if (hours <= 24) return { points: 16, label: `updated ${Math.round(hours)}h ago` }
  if (hours <= 72) return { points: 12, label: `updated ${Math.round(hours / 24)}d ago` }
  if (hours <= 168) return { points: 8, label: `updated ${Math.round(hours / 24)}d ago` }
  return { points: 4, label: `updated ${Math.round(hours / 24)}d ago` }
}

export interface VerifyEventInput {
  sourceNames: string[]
  /** Best source tier seen for the item ('tier1' | 'tier2' | 'specialist' | ''). */
  sourceTier?: string
  updatedAt: string | Date
  now?: Date
}

/** Verification + confidence for a corroborated intelligence item. */
export function verifyItem(input: VerifyEventInput): Verification {
  const now = input.now ?? new Date()
  const updatedAt = new Date(input.updatedAt)
  const independent = countIndependentSources(input.sourceNames)
  const tier = input.sourceTier ?? ''

  let level: VerificationLevel
  if (independent >= 3 && tier === 'tier1') level = 'verified'
  else if (independent >= 2) level = 'multiple-sources'
  else if (independent === 1) level = 'unconfirmed'
  else level = 'rumor'

  const reasons: string[] = []
  reasons.push(
    independent === 1
      ? '1 independent source (syndication collapsed)'
      : `${independent} independent sources (syndication collapsed)`
  )
  if (tier) reasons.push(`best source tier: ${tier}`)
  else reasons.push('source tier unrecorded')

  // Confidence components — each visible in the reasons
  const sourcePts = Math.min(40, independent * 12)
  const tierPts = tier === 'tier1' ? 25 : tier === 'tier2' ? 18 : tier === 'specialist' ? 14 : 6
  const rec = recencyPoints(updatedAt, now)
  const levelPts = level === 'verified' ? 15 : level === 'multiple-sources' ? 10 : level === 'unconfirmed' ? 4 : 0
  const confidence = Math.min(100, sourcePts + tierPts + rec.points + levelPts)

  reasons.push(rec.label)
  reasons.push(`verification level: ${VERIFICATION_LABELS[level]}`)

  return {
    level,
    label: VERIFICATION_LABELS[level],
    independentSources: independent,
    confidence,
    confidenceCategory: confidenceCategory(confidence),
    reasons,
    updatedAt: updatedAt.toISOString(),
  }
}

/** Verification for items from official authoritative feeds (USGS, WHO, GDACS). */
export function verifyOfficialFeed(feedName: string, updatedAt: string | Date, now?: Date): Verification {
  const rec = recencyPoints(new Date(updatedAt), now ?? new Date())
  const confidence = Math.min(100, 40 + 25 + rec.points + 15)
  return {
    level: 'verified',
    label: VERIFICATION_LABELS.verified,
    independentSources: 1,
    confidence,
    confidenceCategory: confidenceCategory(confidence),
    reasons: [`official authoritative feed: ${feedName}`, rec.label],
    updatedAt: new Date(updatedAt).toISOString(),
  }
}

/* ── Aggregate data quality (country assessments, signals) ────────────────── */

export interface QualityInput {
  eventCount: number
  independentSources: number
  lastEventAt: string | Date | null
  hasSignal: boolean
  now?: Date
}

export interface DataQuality {
  score: number
  category: ConfidenceCategory
  reasons: string[]
}

/** Intelligence quality for an aggregate object (country, prediction). */
export function assessQuality(input: QualityInput): DataQuality {
  const now = input.now ?? new Date()
  const coveragePts = Math.min(35, input.eventCount * 3)
  const sourcePts = Math.min(30, input.independentSources * 5)
  const rec = input.lastEventAt
    ? recencyPoints(new Date(input.lastEventAt), now)
    : { points: 0, label: 'no recent events' }
  const signalPts = input.hasSignal ? 15 : 0

  const score = Math.min(100, coveragePts + sourcePts + rec.points + signalPts)
  const reasons = [
    `${input.eventCount} corroborated events in window`,
    `${input.independentSources} independent sources`,
    rec.label,
    input.hasSignal ? 'active escalation signal' : 'no escalation signal',
  ]
  return { score, category: confidenceCategory(score), reasons }
}
