import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockSet = vi.fn()

vi.mock('../lib/redis.js', () => ({
  redis: { get: mockGet, set: mockSet },
}))

const { isDuplicate, markSeen } = await import('./deduplicate.js')

describe('isDuplicate', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset()
  })

  it('returns false when key not in Redis', async () => {
    mockGet.mockResolvedValue(null)
    const result = await isDuplicate('event123', 'https://example.com/article')
    expect(result).toBe(false)
  })

  it('returns true when key already in Redis', async () => {
    mockGet.mockResolvedValue('1')
    const result = await isDuplicate('event123', 'https://example.com/article')
    expect(result).toBe(true)
  })

  it('uses consistent hash for same inputs', async () => {
    mockGet.mockResolvedValue(null)
    await isDuplicate('event123', 'https://example.com/article')
    await isDuplicate('event123', 'https://example.com/article')
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockGet.mock.calls[0][0]).toBe(mockGet.mock.calls[1][0])
  })
})

describe('markSeen', () => {
  it('sets key in Redis with 7-day TTL', async () => {
    await markSeen('event123', 'https://example.com/article')
    expect(mockSet).toHaveBeenCalledWith(
      expect.any(String),
      '1',
      'EX',
      604800
    )
  })
})
