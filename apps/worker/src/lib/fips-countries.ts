// FIPS 10-4 country code → canonical country name.
//
// Conflicts are keyed `conflict-<fips>` (the GDELT ActionGeo country code). The
// stored `name` was historically derived from GDELT's free-text geo label,
// which is frequently wrong (source-nationality bias, centroid fallbacks) — e.g.
// Ukraine showing as "Russia", Sudan as "United Kingdom". Deriving the name from
// the stable FIPS code instead makes it correct and self-healing.
//
// Covers the standard FIPS 10-4 set for sovereign states (plus a few common
// territories that GDELT codes). Unknown codes fall back to the existing name,
// so this never makes a label worse.
export const FIPS_COUNTRY: Record<string, string> = {
  AE: 'United Arab Emirates', AF: 'Afghanistan', AG: 'Algeria', AJ: 'Azerbaijan',
  AL: 'Albania', AM: 'Armenia', AO: 'Angola', AR: 'Argentina', AS: 'Australia',
  AU: 'Austria', BA: 'Bahrain', BC: 'Botswana', BD: 'Bermuda', BE: 'Belgium',
  BF: 'Bahamas', BG: 'Bangladesh', BH: 'Belize', BK: 'Bosnia and Herzegovina',
  BL: 'Bolivia', BM: 'Myanmar', BN: 'Benin', BO: 'Belarus', BP: 'Solomon Islands',
  BR: 'Brazil', BT: 'Bhutan', BU: 'Bulgaria', BX: 'Brunei', BY: 'Burundi',
  CA: 'Canada', CB: 'Cambodia', CD: 'Chad', CE: 'Sri Lanka', CF: 'Congo',
  CG: 'Democratic Republic of the Congo', CH: 'China', CI: 'Chile', CJ: 'Cayman Islands',
  CM: 'Cameroon', CN: 'Comoros', CO: 'Colombia', CS: 'Costa Rica', CT: 'Central African Republic',
  CU: 'Cuba', CV: 'Cape Verde', CY: 'Cyprus', DA: 'Denmark', DJ: 'Djibouti',
  DO: 'Dominica', DR: 'Dominican Republic', EC: 'Ecuador', EG: 'Egypt', EI: 'Ireland',
  EK: 'Equatorial Guinea', EN: 'Estonia', ER: 'Eritrea', ES: 'El Salvador',
  ET: 'Ethiopia', EZ: 'Czechia', FI: 'Finland', FR: 'France', GA: 'Gambia',
  GB: 'Gabon', GG: 'Georgia', GH: 'Ghana', GM: 'Germany', GR: 'Greece',
  GT: 'Guatemala', GV: 'Guinea', GY: 'Guyana', HA: 'Haiti', HO: 'Honduras',
  HR: 'Croatia', HU: 'Hungary', IC: 'Iceland', ID: 'Indonesia', IN: 'India',
  IR: 'Iran', IS: 'Israel', IT: 'Italy', IV: 'Ivory Coast', IZ: 'Iraq',
  JA: 'Japan', JM: 'Jamaica', JO: 'Jordan', KE: 'Kenya', KG: 'Kyrgyzstan',
  KN: 'North Korea', KS: 'South Korea', KU: 'Kuwait', KZ: 'Kazakhstan',
  LA: 'Laos', LE: 'Lebanon', LG: 'Latvia', LH: 'Lithuania', LI: 'Liberia',
  LO: 'Slovakia', LT: 'Lesotho', LY: 'Libya', MA: 'Madagascar', MD: 'Moldova',
  MG: 'Mongolia', MI: 'Malawi', MK: 'North Macedonia', ML: 'Mali', MO: 'Morocco',
  MP: 'Mauritius', MR: 'Mauritania', MU: 'Oman', MX: 'Mexico', MY: 'Malaysia',
  MZ: 'Mozambique', NG: 'Niger', NI: 'Nigeria', NL: 'Netherlands', NO: 'Norway',
  NP: 'Nepal', NU: 'Nicaragua', NZ: 'New Zealand', OD: 'South Sudan', PA: 'Paraguay',
  PE: 'Peru', PK: 'Pakistan', PL: 'Poland', PM: 'Panama', PO: 'Portugal',
  PP: 'Papua New Guinea', PU: 'Guinea-Bissau', QA: 'Qatar', RO: 'Romania',
  RP: 'Philippines', RS: 'Russia', RW: 'Rwanda', SA: 'Saudi Arabia', SE: 'Seychelles',
  SF: 'South Africa', SG: 'Senegal', SL: 'Sierra Leone', SN: 'Singapore',
  SO: 'Somalia', SP: 'Spain', SU: 'Sudan', SW: 'Sweden', SY: 'Syria',
  SZ: 'Switzerland', TH: 'Thailand', TI: 'Tajikistan', TO: 'Togo', TS: 'Tunisia',
  TU: 'Turkey', TW: 'Taiwan', TX: 'Turkmenistan', TZ: 'Tanzania', UG: 'Uganda',
  UK: 'United Kingdom', UP: 'Ukraine', US: 'United States', UV: 'Burkina Faso',
  UY: 'Uruguay', UZ: 'Uzbekistan', VE: 'Venezuela', VM: 'Vietnam', WE: 'West Bank',
  WZ: 'Eswatini', YM: 'Yemen', ZA: 'Zambia', ZI: 'Zimbabwe', GZ: 'Gaza Strip',
}

/** Canonical country name for a FIPS 10-4 code, or null if unknown. */
export function countryNameFromFips(fips: string): string | null {
  return FIPS_COUNTRY[fips.toUpperCase()] ?? null
}

/**
 * Canonical name for a `conflict-<fips>` id, or null if the code is unknown
 * (caller should keep the existing name rather than overwrite with garbage).
 */
export function conflictNameFromId(conflictId: string): string | null {
  const fips = conflictId.replace(/^conflict-/, '')
  return countryNameFromFips(fips)
}
