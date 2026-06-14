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

/**
 * Recency half-life: an event's weight halves every 60 days. Conflict-level
 * threat is slow-moving — a 35-day half-life "forgot" an active war within ~2
 * months of quiet, dropping a sustained conflict toward level 1. 60 days lets
 * an established war hold a high level across a quiet stretch while still
 * decaying a genuinely resolved conflict over ~6 months.
 */
export const HALF_LIFE_MS = 60 * 24 * 60 * 60 * 1000

/**
 * How far back to load events for aggregation. Beyond ~6 half-lives the
 * decayed weight is under 2%, so this bound is a query-performance cap, not a
 * behavioural cutoff — decay does the real attenuation.
 */
export const THREAT_LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Cumulative decayed INTENSITY needed to reach each level (see eventIntensity).
 * Intensity is lethality-weighted, so the scale is roughly "decayed weighted
 * fatalities". Calibrated against the loaded dataset so S5 = sustained
 * high-lethality armed conflict. Tuned empirically: Ukraine ≈ 1750, Sudan
 * ≈ 1300, Israel ≈ 440 (→ S4), Mexico ≈ 230 (→ S3, out of S5).
 */
export const SUM_THRESHOLDS: Partial<Record<number, number>> = { 5: 650, 4: 330, 3: 140, 2: 50 }

/** Per-event fatality contribution is capped so one mass-casualty aggregate
 * can't single-handedly spike a level, while still dwarfing low-lethality events. */
export const FATALITY_CAP = 300

// Curated (UCDP) violence-type weight, keyed on the mapped category. Organized
// armed conflict outweighs diffuse non-state/criminal violence — this is the
// systemic reason a cartel crime wave (non-state) ranks below an active war.
const UCDP_TYPE_WEIGHT: Record<string, number> = {
  'armed-conflict': 1.0,   // UCDP state-based
  'state-violence': 0.9,   // one-sided (massacres against civilians)
  'insurgency': 0.5,       // non-state (e.g. cartel-vs-cartel)
}

// GDELT has no fatality count; map AI severity to a fatality-equivalent proxy
// so corroborated GDELT events still contribute on the same intensity scale.
const GDELT_SEVERITY_PROXY = [0, 1, 3, 10, 40, 90] // index = severity 0..5
const GDELT_CATEGORY_WEIGHT: Record<string, number> = {
  'armed-conflict': 1, 'terrorism': 1, 'insurgency': 1, 'state-violence': 1,
  'civil-unrest': 0.4, 'political-instability': 0.3, 'other': 0,
}

/** An event's contribution to the aggregation. */
export interface ThreatEvent {
  severity: number
  publishedAt: Date
  fatalities?: number
  category?: string
  /** True for curated (UCDP) events — drives the fatality path vs the GDELT proxy. */
  curated?: boolean
}

/**
 * Lethality-weighted intensity of a single event. Curated events are driven by
 * fatalities (capped) × violence-type weight, with a floor of 1 so a confirmed
 * conflict event with no recorded deaths still counts. Non-curated (GDELT)
 * events use a severity→fatality proxy × category weight. This is what stops
 * event *volume* alone from producing S5.
 */
export function eventIntensity(e: ThreatEvent): number {
  const cat = e.category ?? ''
  if (e.curated) {
    const fat = Math.min(Math.max(e.fatalities ?? 0, 1), FATALITY_CAP)
    return fat * (UCDP_TYPE_WEIGHT[cat] ?? 0.7)
  }
  const sev = Math.max(0, Math.min(5, Math.round(e.severity)))
  return (GDELT_SEVERITY_PROXY[sev] ?? 0) * (GDELT_CATEGORY_WEIGHT[cat] ?? 0.7)
}

/** Recency weight in (0, 1] for an event of the given age. Future events → 0. */
export function recencyWeight(ageMs: number): number {
  if (ageMs < 0) return 0
  return Math.pow(0.5, ageMs / HALF_LIFE_MS)
}

/**
 * Compute the threat level (1–5) from corroborated events as the decayed sum of
 * per-event INTENSITY (lethality-weighted), relative to `asOf`. `asOf` defaults
 * to now; the replay API passes a historical timestamp for strict point-in-time
 * reconstruction (events after `asOf` get zero weight — no lookahead).
 */
export function threatFromEvents(events: ThreatEvent[], asOf: Date = new Date()): number {
  const asOfMs = asOf.getTime()
  let sum = 0
  for (const e of events) {
    sum += recencyWeight(asOfMs - e.publishedAt.getTime()) * eventIntensity(e)
  }

  for (let s = 5; s >= 2; s--) {
    if (sum >= (SUM_THRESHOLDS[s] ?? Infinity)) return s
  }
  return 1
}
