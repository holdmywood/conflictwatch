import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueEvent = vi.fn()
const mockFindUniqueSource = vi.fn()
const mockFindManyEvent = vi.fn()

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    event: { findUnique: mockFindUniqueEvent, findMany: mockFindManyEvent },
    eventSource: { findUnique: mockFindUniqueSource },
  },
}))

const { isDuplicate, clusterExists, findGdeltNearDuplicate } = await import('./deduplicate.js')

describe('isDuplicate', () => {
  beforeEach(() => {
    mockFindUniqueEvent.mockReset()
    mockFindUniqueSource.mockReset()
  })

  it('returns false when event does not exist in DB', async () => {
    mockFindUniqueEvent.mockResolvedValue(null)
    const result = await isDuplicate('event123', 'https://example.com/article')
    expect(result).toBe(false)
    expect(mockFindUniqueSource).not.toHaveBeenCalled()
  })

  it('returns false when event exists but source URL not yet recorded', async () => {
    mockFindUniqueEvent.mockResolvedValue({ id: 'cuid-1' })
    mockFindUniqueSource.mockResolvedValue(null)
    const result = await isDuplicate('event123', 'https://example.com/article')
    expect(result).toBe(false)
  })

  it('returns true when both event and source URL are already in DB', async () => {
    mockFindUniqueEvent.mockResolvedValue({ id: 'cuid-1' })
    mockFindUniqueSource.mockResolvedValue({ id: 'src-1' })
    const result = await isDuplicate('event123', 'https://example.com/article')
    expect(result).toBe(true)
  })
})

describe('findGdeltNearDuplicate', () => {
  const e = { conflictId: 'conflict-up', lat: 50.45, lng: 30.52, publishedAt: new Date('2026-06-10T00:00:00Z') }

  beforeEach(() => mockFindManyEvent.mockReset())

  it('returns a matching event id when a GDELT event is within the radius', async () => {
    mockFindManyEvent.mockResolvedValue([{ id: 'gdelt-1', lat: 50.46, lng: 30.53 }]) // ~1.3km away
    expect(await findGdeltNearDuplicate(e)).toBe('gdelt-1')
  })

  it('returns null when the nearest event is outside the radius', async () => {
    mockFindManyEvent.mockResolvedValue([{ id: 'gdelt-far', lat: 49.0, lng: 32.0 }]) // ~180km away
    expect(await findGdeltNearDuplicate(e)).toBeNull()
  })

  it('excludes UCDP events from the candidate query (no self-match)', async () => {
    mockFindManyEvent.mockResolvedValue([])
    await findGdeltNearDuplicate(e)
    const where = mockFindManyEvent.mock.calls[0][0].where
    expect(where.NOT).toEqual({ clusterId: { startsWith: 'ucdp-' } })
    expect(where.conflictId).toBe('conflict-up')
  })
})

describe('clusterExists', () => {
  beforeEach(() => {
    mockFindUniqueEvent.mockReset()
  })

  it('returns the event id when the cluster is already classified in DB', async () => {
    mockFindUniqueEvent.mockResolvedValue({ id: 'cuid-1' })
    const result = await clusterExists('event123')
    expect(result).toBe('cuid-1')
  })

  it('returns null when the cluster is unknown', async () => {
    mockFindUniqueEvent.mockResolvedValue(null)
    const result = await clusterExists('event123')
    expect(result).toBeNull()
  })
})
