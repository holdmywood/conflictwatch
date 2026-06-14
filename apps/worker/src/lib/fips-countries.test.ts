import { describe, it, expect } from 'vitest'
import { countryNameFromFips, conflictNameFromId } from './fips-countries.js'

describe('countryNameFromFips', () => {
  it('maps the codes that were mislabeled in prod to the correct country', () => {
    // GDELT geo labels had these wrong; FIPS is authoritative.
    expect(countryNameFromFips('UP')).toBe('Ukraine')        // was "Russia"
    expect(countryNameFromFips('SU')).toBe('Sudan')          // was "United Kingdom"
    expect(countryNameFromFips('CG')).toBe('Democratic Republic of the Congo') // was "Lebanon"
    expect(countryNameFromFips('IN')).toBe('India')          // was "Oman"
    expect(countryNameFromFips('CO')).toBe('Colombia')       // was "Venezuela"
    expect(countryNameFromFips('NG')).toBe('Niger')          // was "Nigeria"
    expect(countryNameFromFips('NI')).toBe('Nigeria')        // distinct from Niger
    expect(countryNameFromFips('IS')).toBe('Israel')         // was "Gaza Strip"
    expect(countryNameFromFips('US')).toBe('United States')  // was "Iran/Oman"
  })

  it('is case-insensitive', () => {
    expect(countryNameFromFips('up')).toBe('Ukraine')
  })

  it('returns null for unknown codes so the caller keeps the existing name', () => {
    expect(countryNameFromFips('ZZ')).toBeNull()
  })
})

describe('conflictNameFromId', () => {
  it('extracts the FIPS code from a conflict id', () => {
    expect(conflictNameFromId('conflict-up')).toBe('Ukraine')
    expect(conflictNameFromId('conflict-su')).toBe('Sudan')
  })

  it('returns null for an unknown code', () => {
    expect(conflictNameFromId('conflict-zz')).toBeNull()
  })
})
