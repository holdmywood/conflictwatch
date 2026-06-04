import { describe, it, expect, vi } from 'vitest'

const mockEventFindMany = vi.fn()

vi.mock('@conflictwatch/db', () => ({
  prisma: { event: { findMany: mockEventFindMany } },
}))

const { computeNoveltyScore, computeCoverageGapScore } = await import('./surprise.js')

describe('computeCoverageGapScore', () => {
  it('returns 0 for severity 1 with 5+ sources', () => {
    expect(computeCoverageGapScore(1, 5)).toBe(0)
  })

  it('returns maximum for severity 5 with 0 sources', () => {
    expect(computeCoverageGapScore(5, 0)).toBe(5)
  })

  it('returns partial score for mid-range inputs', () => {
    // severity=4, 2 sources → 4 * (1 - min(1, 2/5)) = 4 * 0.6 = 2.4
    expect(computeCoverageGapScore(4, 2)).toBeCloseTo(2.4, 5)
  })

  it('clips independentSourceCount at 5 (score is 0 at 5+ sources, any severity)', () => {
    expect(computeCoverageGapScore(5, 6)).toBe(0)
  })
})

describe('computeNoveltyScore', () => {
  it('returns 0 when no prior events (no baseline)', async () => {
    mockEventFindMany.mockResolvedValue([])
    const score = await computeNoveltyScore('conflict-ua', 3, new Date())
    expect(score).toBe(0)
  })

  it('returns positive novelty for severity above baseline', async () => {
    mockEventFindMany.mockResolvedValue([
      { severity: 2 }, { severity: 2 }, { severity: 2 },
    ])
    // mean=2, stddev=0 → clamp to max(1,0)=1; novelty = (4-2)/1 = 2.0
    const score = await computeNoveltyScore('conflict-ua', 4, new Date())
    expect(score).toBeGreaterThan(0)
  })

  it('clips score at 5', async () => {
    mockEventFindMany.mockResolvedValue([
      { severity: 1 }, { severity: 1 },
    ])
    const score = await computeNoveltyScore('conflict-ua', 100, new Date())
    expect(score).toBeLessThanOrEqual(5)
  })

  it('clips novelty score at -5 (lower bound)', async () => {
    // Baseline: mean=10, stddev=0 → clamped denominator=1; novelty = (1-10)/1 = -9, clipped to -5
    mockEventFindMany.mockResolvedValue([
      { severity: 10 }, { severity: 10 }, { severity: 10 },
    ])
    const score = await computeNoveltyScore('conflict-ua', 1, new Date())
    expect(score).toBe(-5)
  })

  it('queries only events published before asOf (point-in-time)', async () => {
    mockEventFindMany.mockResolvedValue([])
    const asOf = new Date('2024-06-01')
    await computeNoveltyScore('conflict-ua', 3, asOf)
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishedAt: expect.objectContaining({ lt: asOf }),
        }),
      })
    )
  })
})
