import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCalibrationFindMany = vi.fn()
const mockCalibrationUpdate = vi.fn().mockResolvedValue({})
const mockEventFindFirst = vi.fn()
const mockSignalUpdate = vi.fn().mockResolvedValue({})
const mockEpisodeUpdate = vi.fn().mockResolvedValue({})

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    calibrationRecord: { findMany: mockCalibrationFindMany, update: mockCalibrationUpdate },
    event: { findFirst: mockEventFindFirst },
    escalationSignal: { update: mockSignalUpdate },
    episodeStore: { update: mockEpisodeUpdate, create: vi.fn() },
  },
}))

const { resolveOutcomes } = await import('./episode-logger.js')

const DAY_MS = 24 * 60 * 60 * 1000

function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  const computedAt = new Date(Date.now() - 20 * DAY_MS) // 20 days ago, horizon 14d → due
  return {
    id: 'cal-1',
    pEscalation: 0.3,
    horizonDays: 14,
    computedAt,
    resolvedAt: null,
    signal: {
      id: 'sig-1',
      targetId: 'conflict-ua',
      computedAt,
      episodeId: 'ep-1',
    },
    ...overrides,
  }
}

describe('resolveOutcomes', () => {
  beforeEach(() => {
    mockCalibrationFindMany.mockReset()
    mockCalibrationUpdate.mockReset().mockResolvedValue({})
    mockEventFindFirst.mockReset()
    mockSignalUpdate.mockReset().mockResolvedValue({})
    mockEpisodeUpdate.mockReset().mockResolvedValue({})
  })

  it('judges escalation by event publishedAt within the horizon window, not ingestedAt', async () => {
    mockCalibrationFindMany.mockResolvedValue([makeRecord()])
    mockEventFindFirst.mockResolvedValue({ id: 'evt-1' })

    await resolveOutcomes()

    const where = mockEventFindFirst.mock.calls[0][0].where
    expect(where.publishedAt).toBeDefined()
    expect(where.ingestedAt).toBeUndefined()
    expect(where.severity).toEqual({ gte: 4 })
  })

  it('does not resolve records still inside their horizon', async () => {
    const computedAt = new Date(Date.now() - 2 * DAY_MS) // 2 days ago, 14d horizon
    mockCalibrationFindMany.mockResolvedValue([
      makeRecord({ computedAt, signal: { id: 'sig-1', targetId: 'conflict-ua', computedAt, episodeId: null } }),
    ])

    await resolveOutcomes()

    expect(mockCalibrationUpdate).not.toHaveBeenCalled()
    expect(mockEventFindFirst).not.toHaveBeenCalled()
  })

  it('computes Brier score against the actual outcome', async () => {
    mockCalibrationFindMany.mockResolvedValue([makeRecord()])
    mockEventFindFirst.mockResolvedValue(null) // no escalation observed

    await resolveOutcomes()

    expect(mockCalibrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualOutcome: false,
          brierScore: expect.closeTo(0.09, 5), // (0.3 - 0)^2
        }),
      })
    )
  })

  it('mirrors a true outcome onto the signal and episode', async () => {
    mockCalibrationFindMany.mockResolvedValue([makeRecord()])
    mockEventFindFirst.mockResolvedValue({ id: 'evt-1' })

    await resolveOutcomes()

    expect(mockSignalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolvedOutcome: true }) })
    )
    expect(mockEpisodeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ escalatedToNational: true }) })
    )
  })
})
