import { describe, it, expect } from 'vitest'
import { threatFromEvents, recencyWeight, HALF_LIFE_MS, type ThreatEvent } from '@conflictwatch/db'

const NOW = new Date('2026-06-14T00:00:00Z')
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 24 * 3600 * 1000)
const sev = (severity: number, ageDays: number): ThreatEvent => ({ severity, publishedAt: daysAgo(ageDays) })

// A sustained stream: one event/day at the given severity for `days` days.
const sustained = (severity: number, days: number): ThreatEvent[] =>
  Array.from({ length: days }, (_, d) => sev(severity, d))

describe('recencyWeight', () => {
  it('is 1 at asOf and halves every half-life', () => {
    expect(recencyWeight(0)).toBe(1)
    expect(recencyWeight(HALF_LIFE_MS)).toBeCloseTo(0.5, 10)
    expect(recencyWeight(2 * HALF_LIFE_MS)).toBeCloseTo(0.25, 10)
  })

  it('is 0 for future events (no lookahead)', () => {
    expect(recencyWeight(-1000)).toBe(0)
  })
})

describe('threatFromEvents — single-event safety', () => {
  it('a single event of any severity can never set an elevated level', () => {
    for (let s = 1; s <= 5; s++) expect(threatFromEvents([sev(s, 0)], NOW)).toBe(1)
  })

  it('an empty conflict is level 1', () => {
    expect(threatFromEvents([], NOW)).toBe(1)
  })
})

describe('threatFromEvents — sustained activity escalates', () => {
  it('a year of daily high-severity activity reaches level 5', () => {
    expect(threatFromEvents(sustained(5, 365), NOW)).toBe(5)
  })

  it('level rises monotonically with sustained tempo', () => {
    const lo = threatFromEvents(sustained(3, 365), NOW)
    const hi = threatFromEvents(sustained(5, 365), NOW)
    expect(hi).toBeGreaterThanOrEqual(lo)
    expect(lo).toBeGreaterThan(1)
  })

  it('high VOLUME of moderate events escalates beyond the bucket cap', () => {
    // Many sev-3 events out-rank a few sev-5 events — the key fix vs the old
    // bucket model, where sev-3 events could never push past level 3.
    const manyModerate = Array.from({ length: 200 }, (_, i) => sev(3, i % 30))
    expect(threatFromEvents(manyModerate, NOW)).toBeGreaterThan(3)
  })
})

describe('threatFromEvents — recency decay', () => {
  it('old events still contribute (not hard-filtered like the 7-day window)', () => {
    // The same burst is worth less when older, but is not dropped to zero.
    const fresh = threatFromEvents(sustained(5, 30), NOW)
    const aged = threatFromEvents(sustained(5, 30).map(e => ({ ...e, publishedAt: new Date(e.publishedAt.getTime() - 90 * 86400_000) })), NOW)
    expect(aged).toBeLessThan(fresh)
    expect(aged).toBeGreaterThan(1) // still registers, unlike a hard 7-day cutoff
  })

  it('an ended conflict decays out of high threat over months', () => {
    const ongoing = threatFromEvents(sustained(5, 365), NOW)
    // Same conflict, but the last event was 240 days ago (fully wound down).
    const ended = threatFromEvents(sustained(5, 60).map(e => ({ ...e, publishedAt: new Date(e.publishedAt.getTime() - 240 * 86400_000) })), NOW)
    expect(ongoing).toBe(5)
    expect(ended).toBeLessThan(ongoing)
  })
})

describe('threatFromEvents — point-in-time (asOf)', () => {
  it('ignores events published after asOf', () => {
    const before = sustained(5, 365)
    const future: ThreatEvent = { severity: 5, publishedAt: new Date(NOW.getTime() + 30 * 86400_000) }
    expect(threatFromEvents([...before, future], NOW)).toBe(threatFromEvents(before, NOW))
  })

  it('reconstructs a lower level at an earlier asOf when activity was just starting', () => {
    // Conflict that began 20 days before NOW: at its 2nd day it was nascent.
    const events = sustained(5, 20)
    const early = new Date(NOW.getTime() - 18 * 86400_000)
    expect(threatFromEvents(events, early)).toBeLessThan(threatFromEvents(events, NOW))
  })
})
