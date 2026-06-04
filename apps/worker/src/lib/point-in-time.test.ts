import { describe, it, expect, vi, afterEach } from 'vitest'

// The held-out date for the test — a fixed past point
const HELD_OUT_DATE = new Date('2024-06-01T00:00:00.000Z')

// Two events: one before, one after the held-out date
const PAST_EVENT = {
  id: 'evt-past',
  severity: 3,
  region: 'Kyiv, Ukraine',
  actor1: 'RUSSIA',
  actor2: 'UKRAINE',
  publishedAt: new Date('2024-05-28T12:00:00.000Z'),
  confidence: 'high',
  locationConfidence: 'high',
}

const FUTURE_EVENT = {
  id: 'evt-future',
  severity: 4,
  region: 'Kyiv, Ukraine',
  actor1: 'RUSSIA',
  actor2: 'UKRAINE',
  publishedAt: new Date('2024-06-05T08:00:00.000Z'), // after HELD_OUT_DATE
  confidence: 'high',
  locationConfidence: 'high',
}

// A mock prisma that enforces point-in-time: throws if WHERE clause allows post-date reads.
// This simulates a "strict store" — any attempt to access data after HELD_OUT_DATE is an error.
const mockFindMany = vi.fn()

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    event: { findMany: mockFindMany },
  },
}))

const { getEventsAsOf } = await import('./point-in-time.js')

afterEach(() => { mockFindMany.mockReset() })

describe('getEventsAsOf (held-out-date test)', () => {
  it('returns only events at or before asOfDate', async () => {
    // The mock returns both events (simulating a DB that has both)
    // The point-in-time accessor must enforce filtering via the WHERE clause
    mockFindMany.mockImplementation(({ where }) => {
      // Simulate the DB enforcing the lte constraint
      const cutoff = where?.publishedAt?.lte
      if (!cutoff) throw new Error('VIOLATION: query missing publishedAt upper bound')
      return Promise.resolve([PAST_EVENT, FUTURE_EVENT].filter(
        e => e.publishedAt <= cutoff
      ))
    })

    const events = await getEventsAsOf('conflict-ua', HELD_OUT_DATE)
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('evt-past')
    for (const e of events) {
      expect(e.publishedAt.getTime()).toBeLessThanOrEqual(HELD_OUT_DATE.getTime())
    }
  })

  it('throws VIOLATION if query omits the publishedAt upper bound', async () => {
    // Prove the mock guard works — if we bypassed getEventsAsOf and queried directly,
    // the mock would throw. The test above proves getEventsAsOf does NOT trigger this.
    mockFindMany.mockImplementation(({ where }) => {
      const cutoff = where?.publishedAt?.lte
      if (!cutoff) return Promise.reject(new Error('VIOLATION: query missing publishedAt upper bound'))
      return Promise.resolve([])
    })
    // Call prisma directly (simulating a bug) — should throw
    await expect(
      (await import('@conflictwatch/db')).prisma.event.findMany({ where: { conflictId: 'x' } } as any)
    ).rejects.toThrow('VIOLATION')
  })

  it('throws when asOfDate is in the future', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await expect(getEventsAsOf('conflict-ua', futureDate)).rejects.toThrow('in the future')
  })

  it('does not call prisma when asOfDate is in the future', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await expect(getEventsAsOf('conflict-ua', futureDate)).rejects.toThrow()
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})
