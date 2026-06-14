/**
 * Country threat aggregation — the single source of truth, shared by the
 * live worker pipeline and the web replay API so historical recomputation
 * uses exactly the production logic.
 *
 * Threat is a RECENCY-WEIGHTED SUM of corroborated event severities. Each
 * event contributes `severity × 0.5^(age / HALF_LIFE)`; the cumulative decayed
 * sum is mapped to a 1–5 level by SUM_THRESHOLDS. This means:
 *   - a *sustained* conflict (continuous inflow) holds an elevated level
 *     because fresh events keep replenishing what decay removes;
 *   - a conflict that *ends* winds down over a few months as its events decay;
 *   - a single event can never set an elevated level (one event's weight is
 *     far below the level-2 threshold);
 *   - high VOLUME of moderate-severity events escalates the level — unlike the
 *     previous bucket model, where a level could only be reached by events at
 *     that exact severity. This is what lets a high-tempo war (many smaller
 *     incidents) read as high threat.
 *
 * Replacing the previous hard 7-day count is what lets a year of backfilled
 * history register: old events still contribute, just at a decayed weight,
 * instead of being filtered out entirely.
 */

/** Recency half-life: an event's weight halves every 35 days. */
export const HALF_LIFE_MS = 35 * 24 * 60 * 60 * 1000

/**
 * How far back to load events for aggregation. Beyond ~6 half-lives the
 * decayed weight is under 2%, so this bound is a query-performance cap, not a
 * behavioural cutoff — decay does the real attenuation.
 */
export const THREAT_LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Cumulative decayed severity-sum needed to reach each level. Calibrated for
 * SUSTAINED inflow under the 35-day half-life (effective accumulation window
 * ≈ HALF_LIFE/ln2 ≈ 50 days), so a year of steady activity at a given tempo
 * settles at a stable level. Level 5 is reserved for Ukraine-scale sustained
 * combat. These are starting values tuned empirically against the loaded
 * dataset (GDELT live + UCDP history).
 */
export const SUM_THRESHOLDS: Partial<Record<number, number>> = { 5: 160, 4: 70, 3: 30, 2: 10 }

/** An event's contribution to the aggregation: its severity and when it occurred. */
export interface ThreatEvent {
  severity: number
  publishedAt: Date
}

/** Recency weight in (0, 1] for an event of the given age. Future events → 0. */
export function recencyWeight(ageMs: number): number {
  if (ageMs < 0) return 0
  return Math.pow(0.5, ageMs / HALF_LIFE_MS)
}

/**
 * Compute the threat level (1–5) from corroborated events, weighting each by
 * recency relative to `asOf`. `asOf` defaults to now for the live pipeline;
 * the replay API passes a historical timestamp for strict point-in-time
 * reconstruction (events after `asOf` get zero weight — no lookahead).
 */
export function threatFromEvents(events: ThreatEvent[], asOf: Date = new Date()): number {
  const asOfMs = asOf.getTime()
  let sum = 0
  for (const e of events) {
    sum += recencyWeight(asOfMs - e.publishedAt.getTime()) * e.severity
  }

  for (let s = 5; s >= 2; s--) {
    if (sum >= (SUM_THRESHOLDS[s] ?? Infinity)) return s
  }
  return 1
}
