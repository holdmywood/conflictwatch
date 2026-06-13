import { describe, it, expect } from 'vitest'
import { recentWindows } from './backfill-windows.js'

describe('recentWindows', () => {
  it('returns 96 windows per day', () => {
    expect(recentWindows(new Date('2026-06-13T12:07:00Z'), 1)).toHaveLength(96)
    expect(recentWindows(new Date('2026-06-13T12:07:00Z'), 7)).toHaveLength(672)
  })

  it('is most-recent-first and starts one window before now', () => {
    const w = recentWindows(new Date('2026-06-13T12:07:00Z'), 1)
    // now aligns down to 12:00; first window is the previous one, 11:45
    expect(w[0]).toBe('20260613114500')
    expect(w[1]).toBe('20260613113000')
    // strictly descending
    for (let i = 1; i < w.length; i++) expect(Number(w[i])).toBeLessThan(Number(w[i - 1]))
  })

  it('aligns to 15-minute UTC boundaries and zero-pads', () => {
    const w = recentWindows(new Date('2026-01-02T00:05:00Z'), 1)
    // aligns down to 00:00, then steps one window back → 23:45 the prior day
    expect(w[0]).toBe('20260101234500')
    expect(w.every(ts => ['00', '15', '30', '45'].includes(ts.slice(10, 12)))).toBe(true)
    expect(w.every(ts => ts.endsWith('00') && ts.length === 14)).toBe(true)
  })

  it('rolls back across day and month boundaries correctly', () => {
    const w = recentWindows(new Date('2026-03-01T00:00:00Z'), 1)
    // first window before 00:00 on Mar 1 is Feb 28 23:45 (2026 not a leap year)
    expect(w[0]).toBe('20260228234500')
  })
})
