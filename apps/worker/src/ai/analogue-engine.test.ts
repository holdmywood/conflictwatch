import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEpisodeFindMany = vi.fn()

vi.mock('@conflictwatch/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@conflictwatch/db')>()
  return {
    ...actual,
    prisma: {
      episodeStore: { findMany: mockEpisodeFindMany },
    },
  }
})

const { findAnalogues } = await import('./analogue-engine.js')

const PAST_DATE = new Date('2024-01-15T00:00:00Z')
const QUERY_DATE = new Date('2024-06-01T00:00:00Z')

const makeEpisode = (id: string, overrides: Partial<{
  eventTempo: number; severitySlope: number; spreadLocations: number;
  sourceBreadth: number; actorCount: number; escalatedToNational: boolean | null;
  snapshotAt: Date;
}> = {}) => ({
  id,
  conflictId: `conflict-${id}`,
  snapshotAt: PAST_DATE,
  eventTempo: 2,
  severitySlope: 0.5,
  spreadLocations: 2,
  sourceBreadth: 3,
  actorCount: 2,
  escalatedToNational: false,
  escalationHorizonDays: 14,
  assetMovesJson: null,
  ...overrides,
})

describe('findAnalogues', () => {
  beforeEach(() => {
    mockEpisodeFindMany.mockReset()
  })

  it('throws when asOfDate is in the future', async () => {
    await expect(
      findAnalogues({ eventTempo: 5, severitySlope: 1, spreadLocations: 3, sourceBreadth: 2, actorCount: 3 },
        new Date(Date.now() + 86400000))
    ).rejects.toThrow('in the future')
    expect(mockEpisodeFindMany).not.toHaveBeenCalled()
  })

  it('queries only episodes with snapshotAt < asOfDate', async () => {
    mockEpisodeFindMany.mockResolvedValue([])
    await findAnalogues({ eventTempo: 5, severitySlope: 1, spreadLocations: 3, sourceBreadth: 2, actorCount: 3 }, QUERY_DATE)
    expect(mockEpisodeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { snapshotAt: { lt: QUERY_DATE } },
      })
    )
  })

  it('returns top-N closest analogues', async () => {
    // ep-1 is very similar to query (same features), ep-2 is very different
    mockEpisodeFindMany.mockResolvedValue([
      makeEpisode('ep-1', { eventTempo: 5, severitySlope: 1, spreadLocations: 3, sourceBreadth: 2, actorCount: 3 }),
      makeEpisode('ep-2', { eventTempo: 20, severitySlope: 5, spreadLocations: 20, sourceBreadth: 10, actorCount: 20 }),
    ])
    const result = await findAnalogues(
      { eventTempo: 5, severitySlope: 1, spreadLocations: 3, sourceBreadth: 2, actorCount: 3 },
      QUERY_DATE, 1
    )
    expect(result.analogues).toHaveLength(1)
    expect(result.analogues[0].episodeId).toBe('ep-1')
  })

  it('computes base rate as fraction escalated among top-N resolved', async () => {
    mockEpisodeFindMany.mockResolvedValue([
      makeEpisode('a', { escalatedToNational: true }),
      makeEpisode('b', { escalatedToNational: true }),
      makeEpisode('c', { escalatedToNational: false }),
      makeEpisode('d', { escalatedToNational: false }),
    ])
    const result = await findAnalogues(
      { eventTempo: 2, severitySlope: 0.5, spreadLocations: 2, sourceBreadth: 3, actorCount: 2 },
      QUERY_DATE, 10
    )
    expect(result.baseRate).toBe(0.5)
    expect(result.totalCandidates).toBe(4)
  })

  it('returns baseRate 0 when no candidates', async () => {
    mockEpisodeFindMany.mockResolvedValue([])
    const result = await findAnalogues(
      { eventTempo: 5, severitySlope: 1, spreadLocations: 3, sourceBreadth: 2, actorCount: 3 },
      QUERY_DATE
    )
    expect(result.baseRate).toBe(0)
    expect(result.totalCandidates).toBe(0)
    expect(result.analogues).toHaveLength(0)
  })
})
