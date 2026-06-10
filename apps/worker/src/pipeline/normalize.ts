import { resolveCoords } from '../lib/geocoder.js'
import { toEventType } from './score.js'
import type { NormalizedEvent } from '../types.js'

// ── Ingest quality constants ─────────────────────────────────────────────────
// A row must pass ALL gates to reach the database.
// Tune these to tighten/loosen noise suppression.

// Minimum distinct outlets (GDELT NumSources) that have covered this event globally.
// Genuine armed-conflict events are covered by many outlets; single-outlet mis-coded
// business/finance stories (e.g. mining investor articles) fail this gate instantly.
const MIN_SOURCES = 3

// Minimum total article count (GDELT NumArticles) in global coverage.
const MIN_ARTICLES = 5

// AvgTone ceiling: drop events above this value (higher = more positive/neutral).
// Real violence reads −4 to −10; finance and product news sits near 0.
const MAX_TONE = -2

// Goldstein scale ceiling: drop events above this value.
// Range: −10 (most conflictual) … +10 (most cooperative).
// Tighter than the previous −2 floor — verbal/mild events sit near 0.
const GOLDSTEIN_MAX = -4

// CAMEO root codes allowed at ingest.
// 17=Coerce, 18=Assault, 19=Fight/Armed-Conflict, 20=Mass-Violence
// Codes 10-16 (demands, disapproval, rejection, threats, protest, posturing, sanctions)
// produce verbal-conflict noise and are excluded. Adjust to tune ingestion.
const CONFLICT_CAMEO_ALLOWLIST = new Set(['17', '18', '19', '20'])

// ── Column indices for GDELT 2.0 Events TSV (0-based, no header row) ────────
// Verified 2026-06-03 against live GDELT file: 61-column layout
// (SOURCEURL at index 60, ADM2Code present in all three geo blocks)
//
// Stable fields (unchanged across all known layouts):
//   0:  GLOBALEVENTID
//   6:  Actor1Name
//   9:  Actor1EthnicCode
//   10: Actor1Religion1Code
//   16: Actor2Name
//   19: Actor2EthnicCode
//   20: Actor2Religion1Code
//   26: EventCode
//   27: EventBaseCode
//   28: EventRootCode
//   29: QuadClass
//   30: GoldsteinScale
//   32: NumSources
//   33: NumArticles
//   34: AvgTone
//
// ActionGeo block (each geo block is 8 fields: Type+FullName+Country+ADM1+ADM2+Lat+Long+FeatureID):
//   Actor1Geo: 35-42
//   Actor2Geo: 43-50
//   ActionGeo: 51-58
//   59: DATEADDED
//   60: SOURCEURL
const E = {
  GLOBAL_EVENT_ID: 0,
  ACTOR1_NAME: 6,
  ACTOR1_ETHNIC_CODE: 9,
  ACTOR1_RELIGION1_CODE: 10,
  ACTOR2_NAME: 16,
  ACTOR2_ETHNIC_CODE: 19,
  ACTOR2_RELIGION1_CODE: 20,
  EVENT_CODE: 26,
  EVENT_ROOT_CODE: 28,
  QUAD_CLASS: 29,
  GOLDSTEIN_SCALE: 30,
  NUM_SOURCES: 32,
  NUM_ARTICLES: 33,
  AVG_TONE: 34,
  ACTION_GEO_TYPE: 51,
  ACTION_GEO_FULL_NAME: 52,
  ACTION_GEO_COUNTRY_CODE: 53,
  ACTION_GEO_ADM1_CODE: 54,
  ACTION_GEO_ADM2_CODE: 55,
  ACTION_GEO_LAT: 56,
  ACTION_GEO_LNG: 57,
  ACTION_GEO_FEATURE_ID: 58,
  DATE_ADDED: 59,
  SOURCE_URL: 60,
} as const

// GDELT Mentions TSV columns (stable across all versions — do not change)
const M = {
  GLOBAL_EVENT_ID: 0,
  EVENT_TIME_DATE: 1,
  MENTION_TIME_DATE: 2,
  MENTION_TYPE: 3,
  MENTION_SOURCE_NAME: 4,
  MENTION_IDENTIFIER: 5,
} as const

export interface EventRow {
  globalEventId: string
  lat: number
  lng: number
  countryCode: string
  region: string
  actor1Name: string
  actor1EthnicCode: string
  actor1Religion1Code: string
  actor2Name: string
  actor2EthnicCode: string
  actor2Religion1Code: string
  eventCode: string
  eventRootCode: string
  quadClass: string
  goldsteinScale: number
  avgTone: number
  publishedAt: Date
}

export interface MentionRow {
  globalEventId: string
  sourceName: string
  url: string
  publishedAt: Date
}

export function parseEventRow(line: string): EventRow | null {
  const cols = line.split('\t')

  // Gate 1: CAMEO root code allowlist (cheapest — no parsing needed)
  const rootCode = cols[E.EVENT_ROOT_CODE] ?? ''
  if (!CONFLICT_CAMEO_ALLOWLIST.has(rootCode)) return null

  // Gate 2: corroboration — require global multi-outlet coverage
  const numSources = parseInt(cols[E.NUM_SOURCES] ?? '0', 10)
  if (numSources < MIN_SOURCES) return null
  const numArticles = parseInt(cols[E.NUM_ARTICLES] ?? '0', 10)
  if (numArticles < MIN_ARTICLES) return null

  // Gate 3: Goldstein scale — drop mild/verbal events even with allowed root codes
  const goldstein = parseFloat(cols[E.GOLDSTEIN_SCALE] ?? '0')
  if (isNaN(goldstein) || goldstein > GOLDSTEIN_MAX) return null

  // Gate 4: average tone — finance/product news has neutral or positive tone
  const avgTone = parseFloat(cols[E.AVG_TONE] ?? '0')
  if (isNaN(avgTone) || avgTone > MAX_TONE) return null

  // Gate 5: actor sanity — drop self-referential GDELT coding artifacts
  const actor1Name = cols[E.ACTOR1_NAME] ?? ''
  const actor2Name = cols[E.ACTOR2_NAME] ?? ''
  if (!actor1Name) return null
  if (actor1Name === actor2Name) return null

  // Coordinate resolution (after cheap text-only gates)
  const rawLat = parseFloat(cols[E.ACTION_GEO_LAT] ?? '0')
  const rawLng = parseFloat(cols[E.ACTION_GEO_LNG] ?? '0')
  const countryCode = cols[E.ACTION_GEO_COUNTRY_CODE] ?? ''
  const coords = resolveCoords(rawLat, rawLng, countryCode)
  if (!coords) return null

  const dateStr = cols[E.DATE_ADDED] ?? ''
  const publishedAt = parseDateAdded(dateStr)

  return {
    globalEventId: cols[E.GLOBAL_EVENT_ID] ?? '',
    lat: coords.lat,
    lng: coords.lng,
    countryCode,
    region: cols[E.ACTION_GEO_FULL_NAME] ?? '',
    actor1Name,
    actor1EthnicCode: cols[E.ACTOR1_ETHNIC_CODE] ?? '',
    actor1Religion1Code: cols[E.ACTOR1_RELIGION1_CODE] ?? '',
    actor2Name,
    actor2EthnicCode: cols[E.ACTOR2_ETHNIC_CODE] ?? '',
    actor2Religion1Code: cols[E.ACTOR2_RELIGION1_CODE] ?? '',
    eventCode: cols[E.EVENT_CODE] ?? '',
    eventRootCode: rootCode,
    quadClass: cols[E.QUAD_CLASS] ?? '',
    goldsteinScale: goldstein,
    avgTone,
    publishedAt,
  }
}

export function parseMentionRow(line: string): MentionRow {
  const cols = line.split('\t')
  const dateStr = cols[M.MENTION_TIME_DATE] ?? ''
  return {
    globalEventId: cols[M.GLOBAL_EVENT_ID] ?? '',
    sourceName: cols[M.MENTION_SOURCE_NAME] ?? '',
    url: cols[M.MENTION_IDENTIFIER] ?? '',
    publishedAt: parseMentionDate(dateStr),
  }
}

// ── Title generation ──────────────────────────────────────────────────────────

const CAMEO_VERB: Record<string, [string, string]> = {
  '17': ['used coercive measures', 'coerced'],
  '18': ['launched an assault', 'launched an assault on'],
  '19': ['engaged in armed conflict', 'clashed with'],
  '20': ['committed mass violence', 'committed mass violence against'],
}

// Neutral location-anchored templates used when actor information is unreliable.
const NEUTRAL_TITLE: Record<string, string> = {
  '17': 'Coercive incident',
  '18': 'Assault',
  '19': 'Armed clash',
  '20': 'Mass violence incident',
}

// Actor names that GDELT auto-generates from ethnic/religious codes but have no
// real-world specificity. Supplement to the code-based check below.
const ETHNIC_RELIGION_NAMES = new Set([
  'jewish', 'muslim', 'christian', 'hindu', 'buddhist', 'sikh',
  'sunni', 'shia', 'protestant', 'catholic', 'orthodox',
  'islamist', 'jihadist',
])

// Returns a sanitized actor name, or null if the actor is identified only by
// ethnicity/religion (which produces offensive or vacuous titles).
function sanitizeActor(name: string, ethnicCode: string, religion1Code: string): string | null {
  if (!name) return null
  if (ethnicCode || religion1Code) return null
  if (ETHNIC_RELIGION_NAMES.has(name.toLowerCase())) return null
  return toTitleCase(name)
}

export function buildTitle(
  actor1Name: string,
  actor2Name: string,
  eventRootCode: string,
  geo: string,
  actor1EthnicCode = '',
  actor1ReligionCode = '',
  actor2EthnicCode = '',
  actor2ReligionCode = ''
): string {
  const a1 = sanitizeActor(actor1Name, actor1EthnicCode, actor1ReligionCode)
  const a2 = sanitizeActor(actor2Name, actor2EthnicCode, actor2ReligionCode)
  const neutral = `${NEUTRAL_TITLE[eventRootCode] ?? 'Incident'} reported in ${geo}`

  // Drop to neutral if no usable actor1, or actors are self-referential
  if (!a1 || a1 === a2) return neutral

  const verbs = CAMEO_VERB[eventRootCode] ?? ['was involved in an incident', 'was involved in an incident with']

  if (a2) return `${a1} ${verbs[1]} ${a2} in ${geo}`
  return `${a1} ${verbs[0]} in ${geo}`
}

export function joinEventsAndMentions(
  eventRows: EventRow[],
  mentionRows: MentionRow[],
  // sourceTier is resolved per-cluster by the trust gate after this join
  sourceTierByCluster?: Map<string, string>
): NormalizedEvent[] {
  const eventMap = new Map(eventRows.map(e => [e.globalEventId, e]))
  const results: NormalizedEvent[] = []

  for (const mention of mentionRows) {
    const event = eventMap.get(mention.globalEventId)
    if (!event) continue
    results.push({
      globalEventId: event.globalEventId,
      url: mention.url,
      sourceName: mention.sourceName,
      publishedAt: mention.publishedAt,
      lat: event.lat,
      lng: event.lng,
      region: event.region,
      countryCode: event.countryCode,
      actor1Name: event.actor1Name,
      actor1EthnicCode: event.actor1EthnicCode,
      actor1Religion1Code: event.actor1Religion1Code,
      actor2Name: event.actor2Name,
      actor2EthnicCode: event.actor2EthnicCode,
      actor2Religion1Code: event.actor2Religion1Code,
      eventCode: event.eventCode,
      eventRootCode: event.eventRootCode,
      quadClass: event.quadClass,
      goldsteinScale: event.goldsteinScale,
      avgTone: event.avgTone,
      sourceTier: sourceTierByCluster?.get(event.globalEventId) ?? '',
    })
  }

  return results
}

function parseDateAdded(s: string): Date {
  // Format: YYYYMMDDHHMMSS (14 chars) or YYYYMMDD (8 chars)
  if (s.length >= 8) {
    const y = s.slice(0, 4)
    const mo = s.slice(4, 6)
    const d = s.slice(6, 8)
    const h = s.slice(8, 10) || '00'
    const mi = s.slice(10, 12) || '00'
    const sec = s.slice(12, 14) || '00'
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}Z`)
  }
  return new Date()
}

function parseMentionDate(s: string): Date {
  return parseDateAdded(s)
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}
