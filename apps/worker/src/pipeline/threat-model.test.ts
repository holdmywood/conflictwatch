import { describe, it, expect } from 'vitest'
import { threatFromEvents, eventIntensity, recencyWeight, HALF_LIFE_MS, type ThreatEvent } from '@conflictwatch/db'

const NOW = new Date('2026-06-14T00:00:00Z')
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 24 * 3600 * 1000)

// Curated (UCDP) event with a fatality count and violence-type category.
const ucdp = (fatalities: number, category: string, ageDays: number): ThreatEvent =>
  ({ severity: 3, fatalities, category, curated: true, publishedAt: daysAgo(ageDays) })
// Non-curated (GDELT) event driven by AI severity.
const gdelt = (severity: number, ageDays: number, category = 'armed-conflict'): ThreatEvent =>
  ({ severity, category, curated: false, publishedAt: daysAgo(ageDays) })

const sustained = (mk: (d: number) => ThreatEvent, days: number): ThreatEvent[] =>
  Array.from({ length: days }, (_, d) => mk(d))

describe('eventIntensity', () => {
  it('curated intensity is fatalities (capped) × violence-type weight', () => {
    expect(eventIntensity(ucdp(50, 'armed-conflict', 0))).toBe(50)   // state-based ×1.0
    expect(eventIntensity(ucdp(50, 'insurgency', 0))).toBe(25)       // non-state ×0.5
    expect(eventIntensity(ucdp(50, 'state-violence', 0))).toBe(45)   // one-sided ×0.9
  })
  it('caps a mass-casualty aggregate so one event cannot dominate', () => {
    expect(eventIntensity(ucdp(6000, 'armed-conflict', 0))).toBe(300) // capped at FATALITY_CAP
  })
  it('floors a 0-death curated event at 1 (still counts)', () => {
    expect(eventIntensity(ucdp(0, 'armed-conflict', 0))).toBe(1)
  })
  it('non-curated events use a severity→fatality proxy', () => {
    expect(eventIntensity(gdelt(5, 0))).toBe(90)
    expect(eventIntensity(gdelt(3, 0))).toBe(10)
    expect(eventIntensity(gdelt(3, 0, 'other'))).toBe(0) // non-conflict category zeroed
  })
})

describe('lethality beats volume (the core fix)', () => {
  it('a few high-fatality state-based events outrank many low-fatality non-state events', () => {
    // "Sudan": 30 events averaging 80 deaths, state-based.
    const war = sustained(d => ucdp(80, 'armed-conflict', d), 30)
    // "Mexico": 300 events averaging 1 death, non-state cartel violence.
    const crime = sustained(d => ucdp(1, 'insurgency', d % 60), 300)
    expect(threatFromEvents(war, NOW)).toBeGreaterThan(threatFromEvents(crime, NOW))
  })

  it('volume alone cannot reach S5', () => {
    // 500 one-death non-state events — high volume, low lethality.
    const crime = sustained(d => ucdp(1, 'insurgency', d % 90), 500)
    expect(threatFromEvents(crime, NOW)).toBeLessThan(5)
  })

  it('sustained high-lethality armed conflict reaches S5', () => {
    const war = sustained(d => ucdp(40, 'armed-conflict', d), 200)
    expect(threatFromEvents(war, NOW)).toBe(5)
  })
})

describe('single-event safety', () => {
  it('a single event — even a mass-casualty one — cannot reach S4 or S5', () => {
    expect(threatFromEvents([ucdp(6000, 'armed-conflict', 0)], NOW)).toBeLessThan(4)
    expect(threatFromEvents([gdelt(5, 0)], NOW)).toBeLessThan(4)
  })
  it('an empty conflict is level 1', () => {
    expect(threatFromEvents([], NOW)).toBe(1)
  })
})

describe('recency decay & point-in-time', () => {
  it('halves every half-life', () => {
    expect(recencyWeight(0)).toBe(1)
    expect(recencyWeight(HALF_LIFE_MS)).toBeCloseTo(0.5, 10)
  })
  it('an ended conflict decays out of high threat', () => {
    const ongoing = threatFromEvents(sustained(d => ucdp(40, 'armed-conflict', d), 200), NOW)
    const ended = threatFromEvents(
      sustained(d => ucdp(40, 'armed-conflict', d), 60).map(e => ({ ...e, publishedAt: new Date(e.publishedAt.getTime() - 300 * 86400_000) })),
      NOW,
    )
    expect(ongoing).toBe(5)
    expect(ended).toBeLessThan(ongoing)
  })
  it('ignores events published after asOf (no lookahead)', () => {
    const before = sustained(d => ucdp(40, 'armed-conflict', d), 200)
    const future: ThreatEvent = { severity: 3, fatalities: 6000, category: 'armed-conflict', curated: true, publishedAt: new Date(NOW.getTime() + 86400_000) }
    expect(threatFromEvents([...before, future], NOW)).toBe(threatFromEvents(before, NOW))
  })
})
