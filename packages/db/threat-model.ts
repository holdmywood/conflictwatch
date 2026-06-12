/**
 * Country threat aggregation — the single source of truth, shared by the
 * live worker pipeline and the web replay API so historical recomputation
 * uses exactly the production logic.
 *
 * Threat comes only from SUSTAINED, CORROBORATED severity volume in a
 * trailing window: an event at severity S contributes to every level ≤ S,
 * and a level is reached only when its cumulative count clears MIN_EVENTS.
 * 5/5 is reserved for Ukraine-scale sustained combat (15+ corroborated
 * high-severity events); a single event can never set an elevated level.
 */

export const THREAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export const MIN_EVENTS: Partial<Record<number, number>> = { 5: 15, 4: 5, 3: 3, 2: 2 }

/** Compute the threat level (1–5) from the window's corroborated severities. */
export function threatFromSeverities(severities: number[]): number {
  const counts = new Map<number, number>()
  for (const s of severities) {
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }

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
