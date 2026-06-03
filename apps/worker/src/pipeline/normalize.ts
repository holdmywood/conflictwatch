import { resolveCoords } from '../lib/geocoder.js'
import { toEventType } from './score.js'
import type { NormalizedEvent } from '../types.js'

// Column indices for GDELT 2.0 Events TSV (0-based, no header row)
// Verified 2026-06-03 against live GDELT file: 61-column layout
// (SOURCEURL at index 60, ADM2Code present in all three geo blocks)
//
// Stable fields (unchanged across all known layouts):
//   0:  GLOBALEVENTID
//   6:  Actor1Name
//   16: Actor2Name
//   26: EventCode
//   27: EventBaseCode
//   28: EventRootCode
//   29: QuadClass
//   30: GoldsteinScale
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
  ACTOR2_NAME: 16,
  EVENT_CODE: 26,
  EVENT_ROOT_CODE: 28,
  QUAD_CLASS: 29,
  GOLDSTEIN_SCALE: 30,
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
  actor2Name: string
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
    actor1Name: cols[E.ACTOR1_NAME] ?? '',
    actor2Name: cols[E.ACTOR2_NAME] ?? '',
    eventCode: cols[E.EVENT_CODE] ?? '',
    eventRootCode: cols[E.EVENT_ROOT_CODE] ?? '',
    quadClass: cols[E.QUAD_CLASS] ?? '',
    goldsteinScale: parseFloat(cols[E.GOLDSTEIN_SCALE] ?? '0'),
    avgTone: parseFloat(cols[E.AVG_TONE] ?? '0'),
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

export function buildTitle(
  actor1: string,
  actor2: string,
  eventType: string,
  geo: string
): string {
  const a1 = toTitleCase(actor1)
  if (actor2) {
    const a2 = toTitleCase(actor2)
    return `${a1}: ${eventType} involving ${a2} in ${geo}`
  }
  return `${a1}: ${eventType} in ${geo}`
}

export function joinEventsAndMentions(
  eventRows: EventRow[],
  mentionRows: MentionRow[]
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
      actor2Name: event.actor2Name,
      eventCode: event.eventCode,
      eventRootCode: event.eventRootCode,
      quadClass: event.quadClass,
      goldsteinScale: event.goldsteinScale,
      avgTone: event.avgTone,
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
