import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedEvent } from '../types.js'

const mockUpsert = vi.fn().mockResolvedValue({ id: 'event-cuid-1' })
const mockCreate = vi.fn().mockResolvedValue({})

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    conflict: { upsert: mockUpsert },
    event: { upsert: mockUpsert },
    eventSource: { create: mockCreate },
    heartbeat: { upsert: mockUpsert },
  },
}))

const { persistEvent, updateHeartbeat } = await import('./persist.js')

const sampleEvent: NormalizedEvent = {
  globalEventId: '1234567890',
  url: 'https://reuters.com/article',
  sourceName: 'Reuters',
  publishedAt: new Date('2024-06-01T12:00:00Z'),
  lat: 48.38,
  lng: 31.17,
  region: 'Kyiv, Ukraine',
  countryCode: 'UA',
  actor1Name: 'RUSSIA',
  actor2Name: 'UKRAINE',
  eventCode: '190',
  eventRootCode: '19',
  quadClass: '4',
  goldsteinScale: -10,
  avgTone: -4.5,
}

describe('persistEvent', () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({ id: 'event-cuid-1' })
    mockCreate.mockReset().mockResolvedValue({})
  })

  it('upserts a Conflict record keyed by countryCode', async () => {
    await persistEvent(sampleEvent, ['Reuters'])
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conflict-ua' },
      })
    )
  })

  it('upserts an Event with clusterId = globalEventId', async () => {
    await persistEvent(sampleEvent, ['Reuters'])
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clusterId: '1234567890' },
      })
    )
  })
})

describe('updateHeartbeat', () => {
  it('upserts heartbeat with id=1', async () => {
    await updateHeartbeat(3, 0)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        create: expect.objectContaining({ sourcesOk: 3, sourcesFailed: 0 }),
        update: expect.objectContaining({ sourcesOk: 3, sourcesFailed: 0 }),
      })
    )
  })
})
