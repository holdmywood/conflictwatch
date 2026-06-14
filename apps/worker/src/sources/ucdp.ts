// UCDP (Uppsala Conflict Data Program) curated historical source.
//
// UCDP GED is human-curated armed-conflict data licensed CC BY 4.0 (commercial
// use permitted with attribution). Because it is structured and curated, it
// needs NO AI classification: every field below is derived directly from the
// dataset, so ingesting it costs ZERO Anthropic tokens. This is the explicit
// "skip enrichment for trusted structured sources" path — it never calls the
// classifier.
//
// Attribution (required by CC BY 4.0): Davies, Pettersson & Öberg, "Organized
// violence 1989–2025…", Journal of Peace Research 2026; Sundberg & Melander
// (2013); UCDP is part of DEMSCORE (Swedish Research Council grant 2021-00162).
//
// Two compatible products share one schema:
//   - GED (finalized, annual) — https://ucdp.uu.se/downloads/ged/
//   - Candidate / UCDPCED (current year, monthly) — keeps history current.
// This adapter parses either; the backfill/poll scripts choose the file.

import axios from 'axios'
import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'

// Default download URLs (overridable via env in the backfill/poll scripts).
// Finalized GED (annual, 1989–latest) is zipped; Candidate (current year,
// monthly) is plain CSV. Both share the GED schema. Update CANDIDATE as new
// monthly versions publish — see https://ucdp.uu.se/downloads/.
export const UCDP_GED_ZIP_URL = 'https://ucdp.uu.se/downloads/ged/ged261-csv.zip'
export const UCDP_CANDIDATE_CSV_URL = 'https://ucdp.uu.se/downloads/candidateged/GEDEvent_v26_0_4.csv'

/** A structured event ready to persist directly — no classifier involved. */
export interface CuratedEvent {
  clusterId: string // `ucdp-<id>` — unique, so re-ingest is idempotent
  title: string
  summary: string
  countryCode: string // FIPS 10-4, so it groups into the same conflict as GDELT
  region: string
  lat: number
  lng: number
  severity: number // 1–5
  eventType: string
  category: string
  significance: string
  publishedAt: Date
  confidence: 'high'
  locationConfidence: 'high' | 'medium' | 'low'
  sourceName: string
  sourceUrl: string
  sourceTier: 'specialist'
}

// ── Gleditsch & Ward country number → FIPS 10-4 ───────────────────────────────
// GDELT codes ActionGeo_CountryCode as FIPS 10-4, and conflicts are keyed
// `conflict-<fips>`. Mapping UCDP's stable GW country_id to the same FIPS code
// is what merges UCDP history into the existing per-country conflict instead of
// creating a duplicate. Keyed on the integer id (not the name string, which
// varies, e.g. "Myanmar (Burma)"). Covers every country UCDP currently reports
// plus common conflict states; unmapped ids are skipped (logged) rather than
// mis-grouped.
const GW_TO_FIPS: Record<string, string> = {
  '41': 'HA', '51': 'JM', '70': 'MX', '80': 'BH', '90': 'GT', '100': 'CO',
  '101': 'VE', '130': 'EC', '140': 'BR', '365': 'RS', '369': 'UP', '432': 'ML',
  '436': 'NG', '439': 'UV', '452': 'GH', '471': 'CM', '475': 'NI', '482': 'CT',
  '483': 'CD', '490': 'CG', '500': 'UG', '501': 'KE', '516': 'BY', '520': 'SO',
  '530': 'ET', '541': 'MZ', '560': 'SF', '600': 'MO', '615': 'AG', '616': 'TS',
  '620': 'LY', '625': 'SU', '626': 'OD', '630': 'IR', '640': 'TU', '645': 'IZ',
  '651': 'EG', '652': 'SY', '660': 'LE', '663': 'JO', '666': 'IS', '670': 'SA',
  '678': 'YM', '696': 'AE', '700': 'AF', '750': 'IN', '770': 'PK', '771': 'BG',
  '775': 'BM', '800': 'TH', '811': 'CB', '812': 'LA', '816': 'VM', '840': 'RP',
  '850': 'ID', '910': 'PP',
}

// type_of_violence: 1 state-based, 2 non-state, 3 one-sided (against civilians)
const VIOLENCE_LABEL: Record<string, string> = {
  '1': 'Armed clash',
  '2': 'Non-state armed clash',
  '3': 'Violence against civilians',
}
const VIOLENCE_EVENT_TYPE: Record<string, string> = {
  '1': 'armed_conflict',
  '2': 'non_state_conflict',
  '3': 'one_sided_violence',
}
const VIOLENCE_CATEGORY: Record<string, string> = {
  '1': 'armed-conflict',
  '2': 'insurgency',
  '3': 'state-violence',
}

/** Map UCDP "best" fatality estimate to the shared 1–5 severity scale. */
export function ucdpSeverity(best: number): number {
  if (best >= 25) return 5
  if (best >= 8) return 4
  if (best >= 2) return 3
  return 2 // a confirmed violent event with 0–1 recorded deaths
}

/**
 * where_prec: 1 exact .. 2 near .. 3 admin-2 .. 4 admin-1 .. 5–7 country/region.
 * Only precisely-located events drive threat; coarse country-centroid rows are
 * marked 'low' so they neither dominate the globe nor inflate threat.
 */
export function ucdpLocationConfidence(wherePrec: number): 'high' | 'medium' | 'low' {
  if (wherePrec <= 2) return 'high'
  if (wherePrec === 3) return 'medium'
  return 'low'
}

function significanceFor(severity: number): string {
  if (severity >= 4) return 'severe'
  if (severity === 3) return 'nationally-significant'
  return 'local-isolated'
}

/** Parse UCDP's "YYYY-MM-DD HH:MM:SS.mmm" date_start as UTC midnight. */
function parseUcdpDate(s: string): Date | null {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`)
  return isNaN(d.getTime()) ? null : d
}

function validCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  )
}

/**
 * Map one raw UCDP CSV row to a CuratedEvent. Returns null for rows that can't
 * be placed (unknown country, bad coordinates, bad date) rather than guessing.
 */
export function mapUcdpRow(row: Record<string, string>): CuratedEvent | null {
  const id = row.id?.trim()
  if (!id) return null

  const countryCode = GW_TO_FIPS[row.country_id?.trim() ?? '']
  if (!countryCode) return null

  const lat = parseFloat(row.latitude)
  const lng = parseFloat(row.longitude)
  if (!validCoord(lat, lng)) return null

  const publishedAt = parseUcdpDate(row.date_start ?? '')
  if (!publishedAt) return null

  const tov = row.type_of_violence?.trim() ?? '1'
  const best = Math.max(0, parseInt(row.best || '0', 10) || 0)
  const low = parseInt(row.low || '0', 10) || 0
  const high = parseInt(row.high || '0', 10) || 0
  const severity = ucdpSeverity(best)

  const place = [row.where_coordinates?.trim() || row.adm_1?.trim(), row.country?.trim()]
    .filter(Boolean)
    .join(', ')
  const label = VIOLENCE_LABEL[tov] ?? 'Armed clash'
  const title = `${label} reported in ${place || row.country?.trim() || 'unknown location'}`

  const conflictName = row.conflict_name?.trim()
  const summary =
    `UCDP-recorded ${label.toLowerCase()}. ` +
    `Best fatality estimate: ${best}${high || low ? ` (range ${low}–${high})` : ''}. ` +
    (conflictName ? `Conflict: ${conflictName}. ` : '') +
    `Source: UCDP Georeferenced Event Dataset.`

  return {
    clusterId: `ucdp-${id}`,
    title,
    summary,
    countryCode,
    region: place || (row.country?.trim() ?? countryCode),
    lat,
    lng,
    severity,
    eventType: VIOLENCE_EVENT_TYPE[tov] ?? 'armed_conflict',
    category: VIOLENCE_CATEGORY[tov] ?? 'armed-conflict',
    significance: significanceFor(severity),
    publishedAt,
    confidence: 'high',
    locationConfidence: ucdpLocationConfidence(parseInt(row.where_prec || '7', 10) || 7),
    sourceName: 'UCDP GED',
    sourceUrl: `https://ucdp.uu.se/ged/?id=${id}`,
    sourceTier: 'specialist',
  }
}

/**
 * Discover the current Candidate (UCDPCED) CSV download URLs from the UCDP
 * downloads page. UCDP's candidate filenames are versioned irregularly (monthly
 * `v26_0_4` vs quarterly `v26_01_26_03`), so rather than guess the "latest" name
 * we return ALL candidate CSVs and let the caller merge them (idempotent upsert,
 * latest coverage wins). Falls back to the pinned default if the page is
 * unreachable, so the poll degrades gracefully instead of failing.
 */
export async function resolveCandidateCsvUrls(timeoutMs = 20000): Promise<string[]> {
  try {
    const res = await axios.get<string>('https://ucdp.uu.se/downloads/', { responseType: 'text', timeout: timeoutMs })
    const matches = res.data.match(/candidateged\/GEDEvent_v[0-9_]+\.csv/g) ?? []
    const urls = [...new Set(matches)].map(m => `https://ucdp.uu.se/downloads/${m}`)
    return urls.length > 0 ? urls : [UCDP_CANDIDATE_CSV_URL]
  } catch {
    return [UCDP_CANDIDATE_CSV_URL]
  }
}

/**
 * Download a UCDP dataset (plain `.csv` or zipped `.zip` GED) and parse it into
 * curated events. Pure HTTP + parsing — no Anthropic call, so it costs zero
 * tokens. Within-file duplicate clusterIds are collapsed (a row can appear in
 * both finalized GED and Candidate when years overlap).
 */
export async function fetchUcdpEvents(url: string, timeoutMs = 120000): Promise<CuratedEvent[]> {
  let csvText: string
  if (url.endsWith('.zip')) {
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: timeoutMs })
    const zip = new AdmZip(Buffer.from(res.data))
    const entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.csv'))
    if (!entry) throw new Error(`No CSV entry in UCDP zip: ${url}`)
    csvText = entry.getData().toString('utf8')
  } else {
    const res = await axios.get<string>(url, { responseType: 'text', timeout: timeoutMs })
    csvText = res.data
  }
  const events = parseUcdpCsv(csvText)
  const seen = new Set<string>()
  return events.filter(e => (seen.has(e.clusterId) ? false : (seen.add(e.clusterId), true)))
}

/** Parse a full UCDP CSV (candidate or finalized GED) into curated events. */
export function parseUcdpCsv(csvText: string): CuratedEvent[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[]

  const out: CuratedEvent[] = []
  for (const row of records) {
    const mapped = mapUcdpRow(row)
    if (mapped) out.push(mapped)
  }
  return out
}
