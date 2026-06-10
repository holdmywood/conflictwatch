import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockFindMany = vi.fn()

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    situation: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      findMany: mockFindMany,
    },
  },
}))

const {
  matchOrCreateSituation,
  computeSituationStatus,
  situationLocationKey,
  buildSituationTitle,
  decayStaleSituations,
} = await import('./cluster.js')

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
          location: 'kyiv, ukraine',
          eventIds: ['evt-1'],
          status: 'emerging',
        }),
      })
    )
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result).toBe('sit-new')
  })

  it('matches on the normalized ADM1+country key, not the raw region string', async () => {
    mockFindFirst.mockResolvedValue(null)
    await matchOrCreateSituation({ ...baseEvent, region: 'Hostomel, Kyiv Oblast, Ukraine' })
    const query = mockFindFirst.mock.calls[0][0]
    expect(query.where.location).toBe('kyiv oblast, ukraine')
  })

  it('creates situations with a non-empty rule-based title', async () => {
    mockFindFirst.mockResolvedValue(null)
    await matchOrCreateSituation(baseEvent)
    const created = mockCreate.mock.calls[0][0].data
    expect(created.title).toBeTruthy()
    expect(created.title).toContain('Kyiv, Ukraine')
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

describe('situationLocationKey', () => {
  it('keeps city+country for two-segment regions', () => {
    expect(situationLocationKey('Kyiv, Ukraine')).toBe('kyiv, ukraine')
  })
  it('drops the city for three-segment regions (ADM1 + country)', () => {
    expect(situationLocationKey('Hostomel, Kyiv Oblast, Ukraine')).toBe('kyiv oblast, ukraine')
  })
  it('handles country-only regions', () => {
    expect(situationLocationKey('Ukraine')).toBe('ukraine')
  })
  it('trims whitespace and lowercases', () => {
    expect(situationLocationKey('  Donetsk ,  Ukraine ')).toBe('donetsk, ukraine')
  })
})

describe('buildSituationTitle', () => {
  it('names both actors when present', () => {
    expect(buildSituationTitle(['Russia', 'Ukraine'], ['19'], 'Kyiv, Ukraine'))
      .toBe('Russia–Ukraine armed conflict — Kyiv, Ukraine')
  })
  it('falls back to type + location when no actors', () => {
    expect(buildSituationTitle([], ['18'], 'Khartoum, Sudan'))
      .toBe('Assaults — Khartoum, Sudan')
  })
  it('uses the most severe CAMEO root present', () => {
    expect(buildSituationTitle([], ['17', '20'], 'X')).toBe('Mass violence — X')
  })
})

describe('decayStaleSituations', () => {
  beforeEach(() => {
    mockFindMany.mockReset()
    mockUpdate.mockReset().mockResolvedValue({})
  })

  it('resolves situations with no activity for >72h', async () => {
    const now = new Date('2024-06-10T12:00:00Z')
    mockFindMany.mockResolvedValue([
      {
        id: 'sit-stale',
        status: 'ongoing',
        eventIds: ['a', 'b', 'c'],
        lastSeenAt: new Date('2024-06-01T12:00:00Z'),
      },
    ])
    const changed = await decayStaleSituations(now)
    expect(changed).toBe(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sit-stale' },
        data: { status: 'resolved' },
      })
    )
  })

  it('leaves situations whose status is unchanged alone', async () => {
    const now = new Date('2024-06-10T12:00:00Z')
    mockFindMany.mockResolvedValue([
      {
        id: 'sit-fresh',
        status: 'ongoing',
        eventIds: ['a', 'b', 'c'],
        lastSeenAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      },
    ])
    const changed = await decayStaleSituations(now)
    expect(changed).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
