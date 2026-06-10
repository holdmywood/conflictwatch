import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedEvent } from '../types.js'

const mockUpsert = vi.fn().mockResolvedValue({})
const mockFindMany = vi.fn().mockResolvedValue([])
const mockDeleteMany = vi.fn().mockResolvedValue({})

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    pendingCluster: { upsert: mockUpsert, findMany: mockFindMany, deleteMany: mockDeleteMany },
  },
}))

const { enqueueCluster, drainPending, removePending, MAX_ATTEMPTS } = await import('./pending-queue.js')

const sampleEvent: NormalizedEvent = {
  globalEventId: 'gd-1',
  url: 'https://reuters.com/a',
  sourceName: 'Reuters',
  publishedAt: new Date('2026-06-10T08:00:00Z'),
  lat: 1, lng: 2, region: 'Kyiv, Ukraine', countryCode: 'UA',
  actor1Name: 'RUSSIA', actor1EthnicCode: '', actor1Religion1Code: '',
  actor2Name: 'UKRAINE', actor2EthnicCode: '', actor2Religion1Code: '',
  eventCode: '190', eventRootCode: '19', quadClass: '4',
  goldsteinScale: -10, avgTone: -5, sourceTier: 'tier1',
}

describe('pending-queue', () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({})
    mockFindMany.mockReset().mockResolvedValue([])
    mockDeleteMany.mockReset().mockResolvedValue({})
  })

  it('enqueues a cluster keyed by clusterId', async () => {
    await enqueueCluster('gd-1', [sampleEvent], 0)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clusterId: 'gd-1' } })
    )
  })

  it('drains oldest first and revives Date fields', async () => {
    mockFindMany.mockResolvedValue([
      {
        clusterId: 'gd-1',
        attempts: 1,
        payload: JSON.parse(JSON.stringify([sampleEvent])),
      },
    ])
    const drained = await drainPending(50)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { firstSeenAt: 'asc' } })
    )
    expect(drained).toHaveLength(1)
    expect(drained[0].clusterId).toBe('gd-1')
    expect(drained[0].attempts).toBe(1)
    expect(drained[0].events[0].publishedAt).toBeInstanceOf(Date)
    expect(drained[0].events[0].publishedAt.toISOString()).toBe('2026-06-10T08:00:00.000Z')
  })

  it('drops entries that exhausted their attempts instead of returning them', async () => {
    mockFindMany.mockResolvedValue([
      { clusterId: 'gd-old', attempts: MAX_ATTEMPTS, payload: [] },
    ])
    const drained = await drainPending(50)
    expect(drained).toHaveLength(0)
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clusterId: { in: ['gd-old'] } } })
    )
  })

  it('removePending deletes by clusterId', async () => {
    await removePending('gd-1')
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { clusterId: 'gd-1' } })
  })
})
