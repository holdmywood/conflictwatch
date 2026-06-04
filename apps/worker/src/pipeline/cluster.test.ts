import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    situation: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}))

const { matchOrCreateSituation, computeSituationStatus } = await import('./cluster.js')

const baseEvent = {
  id: 'evt-1',
  conflictId: 'conflict-ua',
  region: 'Kyiv, Ukraine',
  actor1: 'RUSSIA',
  actor2: 'UKRAINE',
  eventRootCode: '19',
  publishedAt: new Date('2024-06-01T12:00:00Z'),
  severity: 4,
}

const existingSituation = {
  id: 'sit-1',
  conflictId: 'conflict-ua',
  location: 'Kyiv, Ukraine',
  actors: ['RUSSIA', 'UKRAINE'],
  cameoRoots: ['19'],
  eventIds: ['evt-0'],
  firstSeenAt: new Date('2024-05-31T12:00:00Z'),
  lastSeenAt: new Date('2024-05-31T12:00:00Z'),
  status: 'emerging',
  title: 'Russian forces clash with Ukrainian defenders',
}

describe('matchOrCreateSituation', () => {
  beforeEach(() => {
    mockFindFirst.mockReset()
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockCreate.mockResolvedValue({ id: 'sit-new' })
    mockUpdate.mockResolvedValue({ id: 'sit-1' })
  })

  it('adds event to existing situation when region and actors match', async () => {
    mockFindFirst.mockResolvedValue(existingSituation)
    const result = await matchOrCreateSituation(baseEvent)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sit-1' } })
    )
    expect(mockCreate).not.toHaveBeenCalled()
    expect(result).toBe('sit-1')
  })

  it('creates new situation when no match found', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await matchOrCreateSituation(baseEvent)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conflictId: 'conflict-ua',
          location: 'Kyiv, Ukraine',
          eventIds: ['evt-1'],
          status: 'emerging',
        }),
      })
    )
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result).toBe('sit-new')
  })

  it('includes new event id in updated eventIds', async () => {
    mockFindFirst.mockResolvedValue(existingSituation)
    await matchOrCreateSituation(baseEvent)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventIds: expect.arrayContaining(['evt-0', 'evt-1']),
          lastSeenAt: baseEvent.publishedAt,
        }),
      })
    )
  })

  it('merges actors into existing situation actors', async () => {
    const sit = { ...existingSituation, actors: ['RUSSIA'] }
    mockFindFirst.mockResolvedValue(sit)
    await matchOrCreateSituation({ ...baseEvent, actor1: 'RUSSIA', actor2: 'UKRAINE' })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actors: expect.arrayContaining(['RUSSIA', 'UKRAINE']),
        }),
      })
    )
  })

  it('queries within 7-day window', async () => {
    mockFindFirst.mockResolvedValue(null)
    await matchOrCreateSituation(baseEvent)
    const query = mockFindFirst.mock.calls[0][0]
    expect(query.where.lastSeenAt.gte).toBeDefined()
    const windowMs = baseEvent.publishedAt.getTime() - query.where.lastSeenAt.gte.getTime()
    expect(windowMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000)
  })
})

describe('computeSituationStatus', () => {
  const now = new Date('2024-06-01T12:00:00Z')

  it('returns resolved when last event is >72h ago', () => {
    const lastSeen = new Date(now.getTime() - 73 * 60 * 60 * 1000)
    expect(computeSituationStatus(5, lastSeen, now, 3)).toBe('resolved')
  })

  it('returns emerging for 1-2 events under 48h', () => {
    const lastSeen = new Date(now.getTime() - 10 * 60 * 60 * 1000)
    expect(computeSituationStatus(2, lastSeen, now, 2)).toBe('emerging')
  })

  it('returns escalating for high event count and recent activity', () => {
    const lastSeen = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    expect(computeSituationStatus(10, lastSeen, now, 10)).toBe('escalating')
  })

  it('returns ongoing for stable multi-day activity', () => {
    const lastSeen = new Date(now.getTime() - 6 * 60 * 60 * 1000)
    expect(computeSituationStatus(5, lastSeen, now, 5)).toBe('ongoing')
  })

  it('returns de-escalating when activity is recent but slowing', () => {
    const lastSeen = new Date(now.getTime() - 30 * 60 * 60 * 1000)
    expect(computeSituationStatus(4, lastSeen, now, 4)).toBe('de-escalating')
  })
})
