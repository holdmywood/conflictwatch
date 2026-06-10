/**
 * Curated military installations — version-controlled editorial data.
 *
 * Coordinates of major, publicly-documented installations (well-known bases
 * widely reported in open sources). This is a deliberately small, honest seed,
 * NOT a comprehensive order of battle — every entry is flagged for editorial
 * review, and the set must grow through the human curation process in
 * docs/curation.md, never by fabricating coordinates.
 */

export const MILITARY_SITES_VERSION = 1

export interface MilitarySite {
  id: string
  name: string
  country: string
  branch: 'naval' | 'air' | 'army' | 'joint'
  lat: number
  lng: number
  operator: string
  reviewStatus: 'approved' | 'unreviewed'
}

export const MILITARY_SITES: readonly MilitarySite[] = [
  { id: 'us-naval-bahrain', name: 'NSA Bahrain (US 5th Fleet)', country: 'Bahrain', branch: 'naval', lat: 26.21, lng: 50.61, operator: 'United States', reviewStatus: 'unreviewed' },
  { id: 'us-aldhafra', name: 'Al Dhafra Air Base', country: 'United Arab Emirates', branch: 'air', lat: 24.25, lng: 54.55, operator: 'United States / UAE', reviewStatus: 'unreviewed' },
  { id: 'us-aludeid', name: 'Al Udeid Air Base', country: 'Qatar', branch: 'air', lat: 25.12, lng: 51.32, operator: 'United States / Qatar', reviewStatus: 'unreviewed' },
  { id: 'us-diego-garcia', name: 'Diego Garcia', country: 'British Indian Ocean Territory', branch: 'joint', lat: -7.31, lng: 72.41, operator: 'United States / United Kingdom', reviewStatus: 'unreviewed' },
  { id: 'us-ramstein', name: 'Ramstein Air Base', country: 'Germany', branch: 'air', lat: 49.44, lng: 7.60, operator: 'United States', reviewStatus: 'unreviewed' },
  { id: 'us-yokosuka', name: 'Fleet Activities Yokosuka', country: 'Japan', branch: 'naval', lat: 35.29, lng: 139.67, operator: 'United States / Japan', reviewStatus: 'unreviewed' },
  { id: 'us-guam', name: 'Naval Base Guam', country: 'Guam', branch: 'naval', lat: 13.43, lng: 144.66, operator: 'United States', reviewStatus: 'unreviewed' },
  { id: 'ru-tartus', name: 'Tartus Naval Facility', country: 'Syria', branch: 'naval', lat: 34.90, lng: 35.87, operator: 'Russia', reviewStatus: 'unreviewed' },
  { id: 'ru-hmeimim', name: 'Hmeimim Air Base', country: 'Syria', branch: 'air', lat: 35.40, lng: 35.95, operator: 'Russia', reviewStatus: 'unreviewed' },
  { id: 'cn-djibouti', name: 'PLA Support Base Djibouti', country: 'Djibouti', branch: 'naval', lat: 11.59, lng: 43.06, operator: 'China', reviewStatus: 'unreviewed' },
  { id: 'fr-djibouti', name: 'French Forces Djibouti', country: 'Djibouti', branch: 'joint', lat: 11.55, lng: 43.15, operator: 'France', reviewStatus: 'unreviewed' },
  { id: 'uk-akrotiri', name: 'RAF Akrotiri', country: 'Cyprus', branch: 'air', lat: 34.59, lng: 32.99, operator: 'United Kingdom', reviewStatus: 'unreviewed' },
] as const
