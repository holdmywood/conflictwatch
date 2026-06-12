import { describe, it, expect } from 'vitest'
import { verifyItem, verifyOfficialFeed, assessQuality, confidenceCategory } from './verification'

const NOW = new Date('2026-06-12T12:00:00Z')
const H = 3_600_000

describe('verifyItem — levels', () => {
  it('verified: 3+ independent sources incl. tier1', () => {
    const v = verifyItem({
      sourceNames: ['Reuters', 'BBC News', 'Al Jazeera'],
      sourceTier: 'tier1',
      updatedAt: new Date(NOW.getTime() - 2 * H),
      now: NOW,
    })
    expect(v.level).toBe('verified')
    expect(v.independentSources).toBe(3)
    expect(v.confidence).toBeGreaterThanOrEqual(90)
    expect(v.reasons.join(' ')).toContain('3 independent sources')
  })

  it('multiple-sources: 2 independent, no tier1 requirement', () => {
    const v = verifyItem({
      sourceNames: ['Dawn', 'The Hindu'],
      sourceTier: 'tier2',
      updatedAt: NOW,
      now: NOW,
    })
    expect(v.level).toBe('multiple-sources')
  })

  it('wire syndication collapses to one confirmation', () => {
    const v = verifyItem({
      sourceNames: ['Reuters UK', 'Reuters India', 'reuters.com'],
      sourceTier: 'tier1',
      updatedAt: NOW,
      now: NOW,
    })
    expect(v.independentSources).toBe(1)
    expect(v.level).toBe('unconfirmed')
  })

  it('3 sources without tier1 stays multiple-sources, not verified', () => {
    const v = verifyItem({
      sourceNames: ['A Paper', 'B Paper', 'C Paper'],
      sourceTier: 'tier2',
      updatedAt: NOW,
      now: NOW,
    })
    expect(v.level).toBe('multiple-sources')
  })

  it('zero sources falls to rumor with floor confidence', () => {
    const v = verifyItem({ sourceNames: [], updatedAt: NOW, now: NOW })
    expect(v.level).toBe('rumor')
    expect(v.confidence).toBeLessThan(40)
  })

  it('confidence decays with staleness', () => {
    const fresh = verifyItem({ sourceNames: ['Reuters', 'BBC'], sourceTier: 'tier1', updatedAt: NOW, now: NOW })
    const stale = verifyItem({
      sourceNames: ['Reuters', 'BBC'],
      sourceTier: 'tier1',
      updatedAt: new Date(NOW.getTime() - 14 * 24 * H),
      now: NOW,
    })
    expect(stale.confidence).toBeLessThan(fresh.confidence)
  })

  it('every verification carries its reasons', () => {
    const v = verifyItem({ sourceNames: ['Reuters'], sourceTier: 'tier1', updatedAt: NOW, now: NOW })
    expect(v.reasons.length).toBeGreaterThanOrEqual(3)
  })
})

describe('verifyOfficialFeed', () => {
  it('official feeds are verified with named provenance', () => {
    const v = verifyOfficialFeed('USGS', NOW, NOW)
    expect(v.level).toBe('verified')
    expect(v.reasons[0]).toContain('USGS')
    expect(v.confidence).toBeGreaterThanOrEqual(90)
  })
})

describe('assessQuality', () => {
  it('strong coverage scores high with full reasoning', () => {
    const q = assessQuality({
      eventCount: 14,
      independentSources: 8,
      lastEventAt: new Date(NOW.getTime() - 3 * H),
      hasSignal: true,
      now: NOW,
    })
    expect(q.score).toBeGreaterThanOrEqual(90)
    expect(q.reasons).toHaveLength(4)
  })

  it('thin coverage scores low', () => {
    const q = assessQuality({ eventCount: 1, independentSources: 1, lastEventAt: null, hasSignal: false, now: NOW })
    expect(q.score).toBeLessThan(40)
  })
})

describe('confidenceCategory boundaries', () => {
  it('maps the documented bands', () => {
    expect(confidenceCategory(95)).toBe('Very high confidence')
    expect(confidenceCategory(80)).toBe('High confidence')
    expect(confidenceCategory(65)).toBe('Moderate confidence')
    expect(confidenceCategory(45)).toBe('Low confidence')
    expect(confidenceCategory(20)).toBe('Very low confidence')
  })
})
