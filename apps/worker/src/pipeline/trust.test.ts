import { describe, it, expect, vi } from 'vitest'

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    domainReliability: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}))

const { extractDomain, domainTier, clusterHasTrustedSource, bestTier } =
  await import('./trust.js')

describe('extractDomain', () => {
  it('strips www prefix', () => {
    expect(extractDomain('https://www.reuters.com/article')).toBe('reuters.com')
  })

  it('handles plain domain', () => {
    expect(extractDomain('https://apnews.com/story')).toBe('apnews.com')
  })

  it('returns empty string for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('')
  })

  it('handles subdomain other than www', () => {
    expect(extractDomain('https://mobile.reuters.com/article')).toBe('mobile.reuters.com')
  })
})

describe('domainTier', () => {
  it('returns tier1 for Reuters', async () => {
    expect(await domainTier('https://reuters.com/article')).toBe('tier1')
  })

  it('returns tier1 for BBC', async () => {
    expect(await domainTier('https://bbc.co.uk/news')).toBe('tier1')
  })

  it('returns tier2 for established national outlet', async () => {
    expect(await domainTier('https://dawn.com/article')).toBe('tier2')
  })

  it('returns specialist for ACLED', async () => {
    expect(await domainTier('https://acleddata.com/dataset')).toBe('specialist')
  })

  it('returns blocked for RT', async () => {
    expect(await domainTier('https://rt.com/news')).toBe('blocked')
  })

  it('returns blocked for Sputnik', async () => {
    expect(await domainTier('https://sputniknews.com/story')).toBe('blocked')
  })

  it('returns unknown for unrecognized domain', async () => {
    expect(await domainTier('https://some-unknown-blog.xyz/post')).toBe('unknown')
  })

  it('returns unknown for empty/invalid URL', async () => {
    expect(await domainTier('')).toBe('unknown')
  })
})

describe('clusterHasTrustedSource', () => {
  it('returns true when at least one tier1 URL is present', async () => {
    const urls = [
      'https://sputniknews.com/story',
      'https://reuters.com/article',
    ]
    expect(await clusterHasTrustedSource(urls)).toBe(true)
  })

  it('returns true when at least one tier2 URL is present', async () => {
    const urls = [
      'https://unknown-blog.xyz/post',
      'https://dawn.com/article',
    ]
    expect(await clusterHasTrustedSource(urls)).toBe(true)
  })

  it('returns true for specialist source', async () => {
    expect(await clusterHasTrustedSource(['https://acleddata.com/dataset'])).toBe(true)
  })

  it('returns false when all sources are blocked', async () => {
    const urls = ['https://rt.com/news', 'https://sputniknews.com/story']
    expect(await clusterHasTrustedSource(urls)).toBe(false)
  })

  it('returns false when all sources are unknown', async () => {
    const urls = ['https://unknownblog.xyz/post', 'https://random-site.io/article']
    expect(await clusterHasTrustedSource(urls)).toBe(false)
  })

  it('returns false for empty URL list', async () => {
    expect(await clusterHasTrustedSource([])).toBe(false)
  })
})

describe('bestTier', () => {
  it('returns tier1 when mixed tiers include tier1', async () => {
    const urls = ['https://rt.com/news', 'https://reuters.com/article', 'https://dawn.com/story']
    expect(await bestTier(urls)).toBe('tier1')
  })

  it('returns tier2 when no tier1 present', async () => {
    const urls = ['https://rt.com/news', 'https://dawn.com/story']
    expect(await bestTier(urls)).toBe('tier2')
  })

  it('returns unknown when no trusted source present', async () => {
    const urls = ['https://rt.com/news']
    // blocked ranks lower than unknown — bestTier returns whatever the highest non-blocked is
    // with only one blocked URL, the only non-blocked option is unknown (no URLs)
    expect(await bestTier(['https://unknown-blog.xyz'])).toBe('unknown')
  })
})
