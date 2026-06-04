import { describe, it, expect, vi } from 'vitest'

vi.mock('@conflictwatch/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@conflictwatch/db')>()
  return {
    ...actual,
    prisma: { exposureLink: { findMany: vi.fn().mockResolvedValue([]) } },
  }
})

const { inferZonesFromRegion } = await import('./exposure-matcher.js')

describe('inferZonesFromRegion', () => {
  it('matches Ukraine by city name', () => {
    expect(inferZonesFromRegion('Kyiv, Ukraine')).toContain('ukraine')
  })

  it('matches Hormuz for Iran', () => {
    expect(inferZonesFromRegion('Tehran, Iran')).toContain('hormuz')
  })

  it('matches bab-el-mandeb for Yemen', () => {
    expect(inferZonesFromRegion('Sanaa, Yemen')).toContain('bab-el-mandeb')
  })

  it('returns empty array for unknown region', () => {
    expect(inferZonesFromRegion('Somewhere Unknown')).toHaveLength(0)
  })

  it('includes explicit chokepoints', () => {
    const zones = inferZonesFromRegion('Generic Region', ['hormuz'])
    expect(zones).toContain('hormuz')
  })

  it('deduplicates when region and chokepoints overlap', () => {
    const zones = inferZonesFromRegion('Tehran, Iran', ['hormuz'])
    expect(zones.filter(z => z === 'hormuz')).toHaveLength(1)
  })
})
