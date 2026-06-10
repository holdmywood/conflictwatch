import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedEvent } from '../types.js'
import type { ClassifyResult } from '../ai/enricher.js'

const mockUpsert = vi.fn().mockResolvedValue({ id: 'event-cuid-1' })
const mockCreate = vi.fn().mockResolvedValue({})
const mockFindUnique = vi.fn().mockResolvedValue(null)
const mockFindMany = vi.fn().mockResolvedValue([])
const mockUpdate = vi.fn().mockResolvedValue({})

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    conflict: { upsert: mockUpsert, findUnique: mockFindUnique, update: mockUpdate },
    event: { upsert: mockUpsert, findMany: mockFindMany },
    eventSource: { upsert: mockCreate },
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
  actor1EthnicCode: '',
  actor1Religion1Code: '',
  actor2Name: 'UKRAINE',
  actor2EthnicCode: '',
  actor2Religion1Code: '',
  eventCode: '190',
  eventRootCode: '19',
  quadClass: '4',
  goldsteinScale: -10,
  avgTone: -4.5,
  sourceTier: 'tier1',
}

// Minimal passing ClassifyResult used by most tests
const sampleClassify: ClassifyResult = {
  include: true,
  exclude_reason: null,
  category: 'armed-conflict',
  significance: 'severe',
  severity: 5,
  stability_impact: 'Active front-line combat; territorial control at risk',
  title: 'Russian forces clash with Ukrainian defenders near Kyiv',
  actors: ['Russia', 'Ukraine'],
  location_confidence: 'high',
}

// Threshold summary (MIN_EVENTS = { 5:15, 4:5, 3:3, 2:2 } with cumulative counting):
//   15 severity-5 events → cumulative.get(5)=15 ≥ 15 → level 5
//    5 severity-5 events → cumulative.get(4)=5  ≥ 5  → level 4
//    3 severity-5 events → cumulative.get(3)=3  ≥ 3  → level 3
//    2 severity-5 events → cumulative.get(2)=2  ≥ 2  → level 2
//    0 events                                          → level 1

const highThreatEvents = Array<{ severity: number }>(15).fill({ severity: 5 })
const midThreatEvents  = Array<{ severity: number }>(5).fill({ severity: 5 })

describe('persistEvent', () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({ id: 'event-cuid-1' })
    mockCreate.mockReset().mockResolvedValue({})
    mockFindUnique.mockReset().mockResolvedValue(null)
    mockFindMany.mockReset().mockResolvedValue([])
    mockUpdate.mockReset().mockResolvedValue({})
  })

  it('discards event when no ClassifyResult is provided', async () => {
    const result = await persistEvent(sampleEvent, ['Reuters'])
    expect(result.discarded).toBe(true)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('discards event when classify.include is false', async () => {
    const excluded: ClassifyResult = { ...sampleClassify, include: false, exclude_reason: 'local crime' }
    const result = await persistEvent(sampleEvent, ['Reuters'], excluded)
    expect(result.discarded).toBe(true)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('upserts a Conflict record keyed by countryCode', async () => {
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conflict-ua' } })
    )
  })

  it('upserts an Event with clusterId = globalEventId', async () => {
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clusterId: '1234567890' } })
    )
  })

  it('uses AI title from ClassifyResult, not template', async () => {
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ title: sampleClassify.title }),
      })
    )
  })

  it('computes threatLevel 5 when 15 corroborated severity-5 events exist', async () => {
    mockFindMany.mockResolvedValue(highThreatEvents)
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conflict-ua' },
        data: expect.objectContaining({ threatLevel: 5 }),
      })
    )
  })

  it('computes threatLevel 4 when 5 severity-5 events exist (cumulative hits level-4 threshold of 5)', async () => {
    mockFindMany.mockResolvedValue(midThreatEvents)
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threatLevel: 4 }),
      })
    )
  })

  it('computes threatLevel 3 when 3 severity-5 events exist', async () => {
    mockFindMany.mockResolvedValue(Array(3).fill({ severity: 5 }))
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threatLevel: 3 }),
      })
    )
  })

  it('computes threatLevel 2 when 2 severity-5 events exist (below level-3 threshold of 3)', async () => {
    mockFindMany.mockResolvedValue(Array(2).fill({ severity: 5 }))
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threatLevel: 2 }),
      })
    )
  })

  it('computes threatLevel 1 when no events in the window', async () => {
    mockFindMany.mockResolvedValue([])
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threatLevel: 1 }),
      })
    )
  })

  it('returns threatLevelJumped=false when no existing conflict', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockFindMany.mockResolvedValue(highThreatEvents)
    const result = await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(result.threatLevelJumped).toBe(false)
  })

  it('returns threatLevelJumped=false when computed threat change is <2', async () => {
    mockFindUnique.mockResolvedValue({ threatLevel: 4 })
    mockFindMany.mockResolvedValue(highThreatEvents)
    const result = await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(result.threatLevelJumped).toBe(false)
  })

  it('returns threatLevelJumped=true when computed threat change is ≥2', async () => {
    mockFindUnique.mockResolvedValue({ threatLevel: 2 })
    mockFindMany.mockResolvedValue(highThreatEvents)
    const result = await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(result.threatLevelJumped).toBe(true)
  })

  it('returns conflictId matching countryCode', async () => {
    const result = await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(result.conflictId).toBe('conflict-ua')
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

  it('includes telemetry counters when provided', async () => {
    await updateHeartbeat(1, 0, { classifyCalls: 12, escalationCalls: 2 })
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ classifyCalls: 12, escalationCalls: 2 }),
        update: expect.objectContaining({ classifyCalls: 12, escalationCalls: 2 }),
      })
    )
  })
})
