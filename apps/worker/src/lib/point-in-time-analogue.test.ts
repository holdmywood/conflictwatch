import { describe, it, expect, vi, afterEach } from 'vitest'

const HELD_OUT_DATE = new Date('2024-06-01T00:00:00Z')

const mockEpisodeFindMany = vi.fn()

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    event: { findMany: vi.fn().mockResolvedValue([]) },
    episodeStore: { findMany: mockEpisodeFindMany },
  },
}))

const { findAnalogues } = await import('../ai/analogue-engine.js')

afterEach(() => { mockEpisodeFindMany.mockReset() })

describe('analogue engine point-in-time guard', () => {
  it('queries episodeStore with snapshotAt < asOfDate (not <=)', async () => {
    mockEpisodeFindMany.mockImplementation(({ where }: { where?: { snapshotAt?: { lt?: Date } } }) => {
      // Guard: throw if the WHERE clause omits the strict past bound
      if (!where?.snapshotAt?.lt) throw new Error('VIOLATION: missing snapshotAt lt bound')
      return Promise.resolve([])
    })
    // Must NOT throw — the engine's WHERE clause must have { snapshotAt: { lt: asOfDate } }
    await expect(findAnalogues(
      { eventTempo: 3, severitySlope: 0.5, spreadLocations: 2, sourceBreadth: 2, actorCount: 2 },
      HELD_OUT_DATE
    )).resolves.toBeDefined()
  })

  it('throws when asOfDate is in the future (analogue path)', async () => {
    const future = new Date(Date.now() + 86400000)
    await expect(
      findAnalogues({ eventTempo: 3, severitySlope: 0.5, spreadLocations: 2, sourceBreadth: 2, actorCount: 2 }, future)
    ).rejects.toThrow('in the future')
    expect(mockEpisodeFindMany).not.toHaveBeenCalled()
  })
})
