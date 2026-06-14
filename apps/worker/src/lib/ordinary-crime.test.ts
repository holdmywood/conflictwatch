import { describe, it, expect } from 'vitest'
import { looksLikeOrdinaryCrime } from './ordinary-crime.js'

describe('looksLikeOrdinaryCrime', () => {
  it('flags ordinary crime / accidents mis-tagged as conflict', () => {
    expect(looksLikeOrdinaryCrime('Nine-year-old Australian girl killed in police shooting in Chakwal, Pakistan')).toBe(true)
    expect(looksLikeOrdinaryCrime('Three killed in car crash on motorway')).toBe(true)
    expect(looksLikeOrdinaryCrime('Armed robbery at city bank leaves two dead')).toBe(true)
    expect(looksLikeOrdinaryCrime('Man arrested in hit-and-run that killed cyclist')).toBe(true)
  })

  it('does NOT flag genuine conflict events, even with civilian victims', () => {
    expect(looksLikeOrdinaryCrime('10-year-old killed in airstrike on Gaza')).toBe(false)
    expect(looksLikeOrdinaryCrime('Drone strike kills 23 in El-Obeid')).toBe(false)
    expect(looksLikeOrdinaryCrime('Shelling kills child as clashes intensify')).toBe(false)
    expect(looksLikeOrdinaryCrime('Police officer killed in militant ambush')).toBe(false) // police + conflict context
  })

  it('does not flag unrelated headlines', () => {
    expect(looksLikeOrdinaryCrime('Government announces new budget')).toBe(false)
    expect(looksLikeOrdinaryCrime('')).toBe(false)
  })
})
