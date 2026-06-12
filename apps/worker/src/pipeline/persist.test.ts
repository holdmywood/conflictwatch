import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedEvent } from '../types.js'
import type { ClassifyResult } from '../ai/enricher.js'

const mockUpsert = vi.fn().mockResolvedValue({ id: 'event-cuid-1' })
const mockCreate = vi.fn().mockResolvedValue({})
const mockFindUnique = vi.fn().mockResolvedValue(null)
const mockFindMany = vi.fn().mockResolvedValue([])
const mockUpdate = vi.fn().mockResolvedValue({})
const mockEventFindUnique = vi.fn().mockResolvedValue(null)
const mockEventUpdate = vi.fn().mockResolvedValue({})
const mockSourceFindMany = vi.fn().mockResolvedValue([])

vi.mock('@conflictwatch/db', async () => {
  // The threat aggregation is pure shared logic — use the real implementation
  // so these tests pin production behavior, not a mock's.
  const threatModel = await vi.importActual<typeof import('../../../../packages/db/threat-model.ts')>(
    '../../../../packages/db/threat-model.ts'
  )
  return {
    ...threatModel,
    prisma: {
      conflict: { upsert: mockUpsert, findUnique: mockFindUnique, update: mockUpdate },
      event: { upsert: mockUpsert, findMany: mockFindMany, findUnique: mockEventFindUnique, update: mockEventUpdate },
      eventSource: { upsert: mockCreate, findMany: mockSourceFindMany },
      heartbeat: { upsert: mockUpsert },
    },
  }
})

const { persistEvent, updateHeartbeat, accrueSourceToCluster, recomputeConflictThreat } = await import('./persist.js')

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

  it('creates new conflicts at threat level 1 — never seeded from one event severity', async () => {
    mockFindUnique.mockResolvedValue(null)
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conflict-ua' },
        create: expect.objectContaining({ threatLevel: 1 }),
      })
    )
  })

  it('does not recompute threat per event (recompute is batched per cycle)', async () => {
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns conflictId matching countryCode', async () => {
    const result = await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(result.conflictId).toBe('conflict-ua')
  })
})

describe('recomputeConflictThreat thresholds', () => {
  beforeEach(() => {
    mockFindMany.mockReset()
    mockUpdate.mockReset().mockResolvedValue({})
  })

  const cases: Array<[number, number]> = [
    [15, 5], // 15 corroborated severity-5 events → level 5
    [5, 4],  // 5 → level 4
    [3, 3],  // 3 → level 3
    [2, 2],  // 2 → level 2
    [0, 1],  // none → level 1
  ]

  for (const [count, expected] of cases) {
    it(`computes level ${expected} from ${count} corroborated severity-5 events`, async () => {
      mockFindMany.mockResolvedValue(Array(count).fill({ severity: 5 }))
      const level = await recomputeConflictThreat('conflict-ua')
      expect(level).toBe(expected)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ threatLevel: expected }) })
      )
    })
  }
})

describe('accrueSourceToCluster', () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({})
    mockEventFindUnique.mockReset().mockResolvedValue(null)
    mockEventUpdate.mockReset().mockResolvedValue({})
    mockSourceFindMany.mockReset().mockResolvedValue([])
  })

  it('returns accrued=false when the cluster is unknown', async () => {
    mockEventFindUnique.mockResolvedValue(null)
    const result = await accrueSourceToCluster(sampleEvent)
    expect(result.accrued).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('records the new source URL on the existing event', async () => {
    mockEventFindUnique.mockResolvedValue({ id: 'event-cuid-1', confidence: 'low', conflictId: 'conflict-ua' })
    mockSourceFindMany.mockResolvedValue([{ name: 'Reuters' }])
    const result = await accrueSourceToCluster(sampleEvent)
    expect(result.accrued).toBe(true)
    expect(result.conflictId).toBe('conflict-ua')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_url: { eventId: 'event-cuid-1', url: sampleEvent.url } },
      })
    )
  })

  it('upgrades confidence when cumulative distinct sources cross the threshold', async () => {
    mockEventFindUnique.mockResolvedValue({ id: 'event-cuid-1', confidence: 'low', conflictId: 'conflict-ua' })
    mockSourceFindMany.mockResolvedValue([
      { name: 'Reuters' }, { name: 'BBC News' }, { name: 'Al Jazeera' },
    ])
    const result = await accrueSourceToCluster(sampleEvent)
    expect(result.confidenceChanged).toBe(true)
    expect(mockEventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-cuid-1' },
        data: { confidence: 'high' },
      })
    )
  })

  it('never downgrades confidence below the stored value', async () => {
    mockEventFindUnique.mockResolvedValue({ id: 'event-cuid-1', confidence: 'high', conflictId: 'conflict-ua' })
    mockSourceFindMany.mockResolvedValue([{ name: 'Reuters' }]) // would score 'low'
    const result = await accrueSourceToCluster(sampleEvent)
    expect(result.confidenceChanged).toBe(false)
    expect(mockEventUpdate).not.toHaveBeenCalled()
  })

  it('collapses syndicated wire copies into one confirmation', async () => {
    mockEventFindUnique.mockResolvedValue({ id: 'event-cuid-1', confidence: 'low', conflictId: 'conflict-ua' })
    // 3 names but all Reuters syndication → 1 canonical source → stays low
    mockSourceFindMany.mockResolvedValue([
      { name: 'Reuters' }, { name: 'Reuters India' }, { name: 'reuters.com' },
    ])
    const result = await accrueSourceToCluster(sampleEvent)
    expect(result.confidenceChanged).toBe(false)
    expect(mockEventUpdate).not.toHaveBeenCalled()
  })
})

describe('recomputeConflictThreat', () => {
  beforeEach(() => {
    mockFindMany.mockReset().mockResolvedValue([])
    mockUpdate.mockReset().mockResolvedValue({})
  })

  it('updates the conflict with the freshly computed level', async () => {
    mockFindMany.mockResolvedValue(Array(5).fill({ severity: 5 }))
    const level = await recomputeConflictThreat('conflict-ua')
    expect(level).toBe(4)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conflict-ua' },
        data: { threatLevel: 4 },
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
