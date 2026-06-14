import { describe, it, expect } from 'vitest'
import { mapUcdpRow, parseUcdpCsv, ucdpSeverity, ucdpLocationConfidence } from './ucdp.js'

// A real-shaped UCDP candidate row (precise Gaza event).
const GAZA_ROW: Record<string, string> = {
  id: '628424', type_of_violence: '1', conflict_name: 'Israel: Palestine',
  side_a: 'Government of Israel', side_b: 'Hamas', country: 'Israel', country_id: '666',
  region: 'Middle East', adm_1: 'Gaza Strip', where_coordinates: 'Beit Lahiya town',
  where_description: 'Beit Lahia, north of the Gaza Strip.', latitude: '31.546397',
  longitude: '34.495142', date_start: '2026-04-27 00:00:00.000', date_end: '2026-04-27 00:00:00.000',
  date_prec: '1', where_prec: '1', best: '1', high: '1', low: '1',
}

describe('ucdpSeverity', () => {
  it('maps fatality counts to the 1–5 scale', () => {
    expect(ucdpSeverity(0)).toBe(2)
    expect(ucdpSeverity(1)).toBe(2)
    expect(ucdpSeverity(2)).toBe(3)
    expect(ucdpSeverity(7)).toBe(3)
    expect(ucdpSeverity(8)).toBe(4)
    expect(ucdpSeverity(24)).toBe(4)
    expect(ucdpSeverity(25)).toBe(5)
    expect(ucdpSeverity(6234)).toBe(5) // capped — a monthly aggregate can't dominate
  })
})

describe('ucdpLocationConfidence', () => {
  it('only precise locations are high/medium; country-level is low', () => {
    expect(ucdpLocationConfidence(1)).toBe('high')
    expect(ucdpLocationConfidence(2)).toBe('high')
    expect(ucdpLocationConfidence(3)).toBe('medium')
    expect(ucdpLocationConfidence(4)).toBe('low')
    expect(ucdpLocationConfidence(6)).toBe('low') // country centroid → excluded from threat
  })
})

describe('mapUcdpRow', () => {
  it('maps a precise event into a curated event with no AI fields', () => {
    const e = mapUcdpRow(GAZA_ROW)!
    expect(e.clusterId).toBe('ucdp-628424')
    expect(e.countryCode).toBe('IS') // GW 666 → FIPS IS (groups with GDELT Israel)
    expect(e.lat).toBeCloseTo(31.546397, 5)
    expect(e.lng).toBeCloseTo(34.495142, 5)
    expect(e.severity).toBe(2) // best=1
    expect(e.confidence).toBe('high')
    expect(e.locationConfidence).toBe('high')
    expect(e.category).toBe('armed-conflict')
    expect(e.sourceTier).toBe('specialist')
    expect(e.publishedAt.toISOString()).toBe('2026-04-27T00:00:00.000Z')
  })

  it('builds a neutral, location-based title (no combatant naming)', () => {
    const e = mapUcdpRow(GAZA_ROW)!
    expect(e.title).toBe('Armed clash reported in Beit Lahiya town, Israel')
    expect(e.title).not.toMatch(/Hamas|Israel.*Government|Government/)
  })

  it('puts factual fatality context in the structured summary', () => {
    const e = mapUcdpRow({ ...GAZA_ROW, best: '12', low: '8', high: '15' })!
    expect(e.summary).toContain('Best fatality estimate: 12')
    expect(e.summary).toContain('range 8–15')
    expect(e.summary).toContain('UCDP')
  })

  it('uses a stable clusterId so re-ingest is idempotent', () => {
    expect(mapUcdpRow(GAZA_ROW)!.clusterId).toBe(mapUcdpRow(GAZA_ROW)!.clusterId)
  })

  it('skips rows with an unmapped country', () => {
    expect(mapUcdpRow({ ...GAZA_ROW, country_id: '999999' })).toBeNull()
  })

  it('skips rows with invalid or (0,0) coordinates', () => {
    expect(mapUcdpRow({ ...GAZA_ROW, latitude: '0', longitude: '0' })).toBeNull()
    expect(mapUcdpRow({ ...GAZA_ROW, latitude: 'NaN', longitude: '5' })).toBeNull()
    expect(mapUcdpRow({ ...GAZA_ROW, latitude: '200', longitude: '5' })).toBeNull()
  })

  it('skips rows with an unparseable date', () => {
    expect(mapUcdpRow({ ...GAZA_ROW, date_start: 'not-a-date' })).toBeNull()
  })
})

describe('parseUcdpCsv', () => {
  it('parses a CSV with a header and quoted comma fields, skipping unmappable rows', () => {
    const csv =
      'id,type_of_violence,country,country_id,where_coordinates,adm_1,latitude,longitude,date_start,where_prec,best,low,high,conflict_name\n' +
      '1,1,Ukraine,369,"Kherson, town",Kherson,46.65,32.61,2026-04-07 00:00:00.000,1,4,4,4,"Russia - Ukraine"\n' +
      '2,3,Nowhereland,99999,Somewhere,X,10,10,2026-04-07 00:00:00.000,1,2,2,2,X\n'
    const out = parseUcdpCsv(csv)
    expect(out).toHaveLength(1) // row 2 has an unmapped country
    expect(out[0].clusterId).toBe('ucdp-1')
    expect(out[0].countryCode).toBe('UP')
    expect(out[0].severity).toBe(3) // best=4
    expect(out[0].title).toContain('Kherson, town')
  })
})
