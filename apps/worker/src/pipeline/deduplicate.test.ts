import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUniqueEvent = vi.fn()
const mockFindUniqueSource = vi.fn()

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    event: { findUnique: mockFindUniqueEvent },
    eventSource: { findUnique: mockFindUniqueSource },
  },
}))

const { isDuplicate, clusterExists } = await import('./deduplicate.js')

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
