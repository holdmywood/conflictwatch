import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMessagesCreate = vi.fn()
const mockSignalCreate = vi.fn().mockResolvedValue({ id: 'sig-1' })
const mockSignalFindFirst = vi.fn().mockResolvedValue(null)
const mockEventFindMany = vi.fn().mockResolvedValue([])
const mockSnapshotEpisode = vi.fn().mockResolvedValue('episode-1')
const mockLogCalibration = vi.fn().mockResolvedValue(undefined)

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}))

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    escalationSignal: { create: mockSignalCreate, findFirst: mockSignalFindFirst },
    event: { findMany: mockEventFindMany },
  },
}))

vi.mock('../ai/episode-logger.js', () => ({
  snapshotEpisode: mockSnapshotEpisode,
  logCalibration: mockLogCalibration,
}))

const { computeTrendFeatures, runEscalationPass } = await import('./escalation.js')

const activeEvents = Array.from({ length: 10 }, (_, i) => ({
  id: `evt-${i}`,
  severity: 4,
  region: 'Kyiv, Ukraine',
  actor1: 'RUSSIA',
  actor2: 'UKRAINE',
  publishedAt: new Date(Date.now() - i * 3 * 60 * 60 * 1000), // spread over last 30h
  confidence: 'high',
  locationConfidence: 'high',
}))

describe('computeTrendFeatures', () => {
  it('computes eventTempo as events per day', () => {
    const features = computeTrendFeatures('conflict-ua', activeEvents, 7)
    // 10 events over 7 days = ~1.4/day
    expect(features.eventTempo).toBeCloseTo(10 / 7, 1)
  })

  it('returns spreadLocations as distinct region count', () => {
    const varied = [
      ...activeEvents.slice(0, 5),
      ...activeEvents.slice(5).map(e => ({ ...e, region: 'Kharkiv, Ukraine' })),
    ]
    const features = computeTrendFeatures('conflict-ua', varied, 7)
    expect(features.spreadLocations).toBe(2)
  })

  it('returns actorCount as distinct non-empty actors', () => {
    const features = computeTrendFeatures('conflict-ua', activeEvents, 7)
    expect(features.actorCount).toBe(2)
  })

  it('returns 0 for all features when events array is empty', () => {
    const features = computeTrendFeatures('conflict-ua', [], 7)
    expect(features.eventTempo).toBe(0)
    expect(features.spreadLocations).toBe(0)
    expect(features.actorCount).toBe(0)
  })
})

describe('runEscalationPass', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
    mockSignalCreate.mockReset().mockResolvedValue({ id: 'sig-1' })
    mockSignalFindFirst.mockReset().mockResolvedValue(null)
    mockEventFindMany.mockReset().mockResolvedValue(activeEvents)
    mockSnapshotEpisode.mockReset().mockResolvedValue('episode-1')
    mockLogCalibration.mockReset().mockResolvedValue(undefined)
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          escalationRisk: 'elevated',
          trajectory: 'worsening',
          drivers: ['sustained shelling', 'civilian displacement'],
          actorsOfConcern: ['Russia'],
          horizon: '7-14 days',
          rationale: 'Tempo has increased over the past 72 hours with no ceasefire signals.',
        }),
      }],
    })
  })

  it('does not emit signal when event count is below threshold', async () => {
    mockEventFindMany.mockResolvedValue(activeEvents.slice(0, 2))
    await runEscalationPass('conflict-ua')
    expect(mockSignalCreate).not.toHaveBeenCalled()
  })

  it('creates EscalationSignal when threshold is met', async () => {
    await runEscalationPass('conflict-ua')
    expect(mockSignalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'country',
          targetId: 'conflict-ua',
          escalationRisk: 'elevated',
        }),
      })
    )
  })

  it('calls snapshotEpisode with conflict features', async () => {
    await runEscalationPass('conflict-ua')
    expect(mockSnapshotEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ conflictId: 'conflict-ua' })
    )
  })

  it('calls logCalibration after creating signal', async () => {
    await runEscalationPass('conflict-ua')
    expect(mockLogCalibration).toHaveBeenCalledWith(
      'sig-1',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(String),
    )
  })

  it('uses Haiku model for escalation assessment', async () => {
    await runEscalationPass('conflict-ua')
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    )
  })

  it('skips if a signal for this conflict was created in the last 6 hours', async () => {
    mockSignalFindFirst.mockResolvedValue({ id: 'existing-sig', computedAt: new Date() })
    await runEscalationPass('conflict-ua')
    expect(mockSignalCreate).not.toHaveBeenCalled()
  })

  it('returns null when JSON parse fails', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
    })
    const result = await runEscalationPass('conflict-ua')
    expect(result).toBeNull()
    expect(mockSignalCreate).not.toHaveBeenCalled()
  })
})
