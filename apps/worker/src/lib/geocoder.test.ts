import { describe, it, expect } from 'vitest'
import { resolveCoords } from './geocoder.js'

describe('resolveCoords', () => {
  it('returns given coords when valid (not 0,0)', () => {
    const result = resolveCoords(48.8566, 2.3522, 'FR')
    expect(result).toEqual({ lat: 48.8566, lng: 2.3522 })
  })

  it('falls back to country centroid when lat=0 lng=0', () => {
    const result = resolveCoords(0, 0, 'UA')
    expect(result).not.toBeNull()
    expect(result!.lat).toBeCloseTo(49.0, 0)
    expect(result!.lng).toBeCloseTo(32.0, 0)
  })

  it('returns null when lat=0 lng=0 and country unknown', () => {
    const result = resolveCoords(0, 0, 'XX')
    expect(result).toBeNull()
  })

  it('returns null for exact (0,0) with no country', () => {
    const result = resolveCoords(0, 0, '')
    expect(result).toBeNull()
  })
})
