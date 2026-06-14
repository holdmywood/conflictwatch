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
  countryCode: 'UP', // FIPS 10-4 for Ukraine (GDELT's ActionGeo code)
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
  primary_location: '',
  lat: null,
  lng: null,
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
      expect.objectContaining({ where: { id: 'conflict-up' } })
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

  it('overrides GDELT coords with AI location when the model is highly confident', async () => {
    // GDELT mis-coded this to Turkey; the AI confidently reads Belfast.
    const wrongGeoEvent: NormalizedEvent = {
      ...sampleEvent, lat: 39.06, lng: 34.91, region: 'Turkey',
    }
    const corrected: ClassifyResult = {
      ...sampleClassify,
      location_confidence: 'high',
      primary_location: 'Belfast, United Kingdom',
      lat: 54.597,
      lng: -5.93,
    }
    await persistEvent(wrongGeoEvent, ['Reuters'], corrected)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clusterId: '1234567890' },
        create: expect.objectContaining({
          lat: 54.597, lng: -5.93, region: 'Belfast, United Kingdom', locationConfidence: 'high',
        }),
      })
    )
  })

  it('keeps GDELT coords when AI location confidence is not high', async () => {
    const lowConf: ClassifyResult = {
      ...sampleClassify,
      location_confidence: 'low',
      primary_location: 'Belfast, United Kingdom',
      lat: 54.597,
      lng: -5.93,
    }
    await persistEvent(sampleEvent, ['Reuters'], lowConf)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clusterId: '1234567890' },
        create: expect.objectContaining({
          lat: sampleEvent.lat, lng: sampleEvent.lng, region: sampleEvent.region, locationConfidence: 'low',
        }),
      })
    )
  })

  it('creates new conflicts at threat level 1 — never seeded from one event severity', async () => {
    mockFindUnique.mockResolvedValue(null)
    await persistEvent(sampleEvent, ['Reuters'], sampleClassify)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conflict-up' },
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
    expect(result.conflictId).toBe('conflict-up')
  })
})

describe('recomputeConflictThreat thresholds', () => {
  beforeEach(() => {
    mockFindMany.mockReset()
    mockUpdate.mockReset().mockResolvedValue({})
  })

  // Threshold math itself is covered by threat-model.test.ts; here we assert
  // recompute wires the windowed query into threatFromEvents and persists the
  // result. A sustained year of severity-5 events is unambiguously level 5.
  const daily = (severity: number, days: number) =>
    Array.from({ length: days }, (_, d) => ({ severity, publishedAt: new Date(Date.now() - d * 86400_000) }))

  const cases: Array<[ReturnType<typeof daily>, number]> = [
    [daily(5, 365), 5], // sustained high-intensity war → level 5
    [[], 1],            // no evidence → level 1
    [daily(5, 1), 1],   // a single recent event never elevates
  ]

  for (const [events, expected] of cases) {
    it(`persists level ${expected} from ${events.length} corroborated events`, async () => {
      mockFindMany.mockResolvedValue(events)
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
    const events = Array.from({ length: 365 }, (_, d) => ({ severity: 5, publishedAt: new Date(Date.now() - d * 86400_000) }))
    mockFindMany.mockResolvedValue(events)
    const level = await recomputeConflictThreat('conflict-ua')
    expect(level).toBe(5)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conflict-ua' },
        data: { threatLevel: 5 },
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
