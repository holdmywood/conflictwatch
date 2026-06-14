import { describe, it, expect } from 'vitest'
import { countryNameFromFips, conflictNameFromId, fipsFromCountryName, fipsFromRegion } from './fips-countries.js'

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

describe('fipsFromCountryName', () => {
  it('maps canonical and aliased names, ignoring parentheticals and case', () => {
    expect(fipsFromCountryName('Ukraine')).toBe('UP')
    expect(fipsFromCountryName('United Kingdom')).toBe('UK')
    expect(fipsFromCountryName('Myanmar (Burma)')).toBe('BM') // UCDP-style suffix
    expect(fipsFromCountryName('DR Congo (Zaire)')).toBe('CG')
    expect(fipsFromCountryName('Russia (Soviet Union)')).toBe('RS')
    expect(fipsFromCountryName('USA')).toBe('US')
    expect(fipsFromCountryName('Tanzania')).toBe('TZ')
  })
  it('returns null for unknown names', () => {
    expect(fipsFromCountryName('Atlantis')).toBeNull()
    expect(fipsFromCountryName('')).toBeNull()
  })
})

describe('fipsFromRegion', () => {
  it('recovers the country from the last segment of a region string', () => {
    expect(fipsFromRegion('Belfast, United Kingdom')).toBe('UK') // the misgeocoding case
    expect(fipsFromRegion('Sheraro, Ethiopia')).toBe('ET')
    expect(fipsFromRegion('El-Obeid, Sudan')).toBe('SU')
  })
  it('returns null when the last segment is not a country', () => {
    expect(fipsFromRegion('Somewhere, Nowhereland')).toBeNull()
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
