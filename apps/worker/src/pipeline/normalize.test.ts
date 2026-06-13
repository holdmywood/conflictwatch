import { describe, it, expect } from 'vitest'
import { parseEventRow, parseMentionRow, buildTitle, joinEventsAndMentions } from './normalize.js'
import type { EventRow, MentionRow } from './normalize.js'

// Step 6.0 verified: 61-column layout (SOURCEURL at index 60, 0-based)
// ActionGeo block includes ADM2Code at index 55, shifting Lat to 56, Long to 57.
//
// Layout for ActionGeo block (0-based):
//   51: ActionGeo_Type
//   52: ActionGeo_FullName
//   53: ActionGeo_CountryCode
//   54: ActionGeo_ADM1Code
//   55: ActionGeo_ADM2Code   ← extra vs 58-col layout
//   56: ActionGeo_Lat
//   57: ActionGeo_Long
//   58: ActionGeo_FeatureID
//   59: DATEADDED
//   60: SOURCEURL

// Baseline row that passes all quality gates:
//   EventRootCode=19, NumSources=3, NumArticles=15, Goldstein=-10, AvgTone=-4.5
//   Actor1=RUSSIA, Actor2=UKRAINE (distinct, non-empty, no ethnic/religion codes)
const SAMPLE_EVENT_ROW = [
  '1234567890',  // 0: GLOBALEVENTID
  '20240601',    // 1: SQLDATE
  '202406',      // 2: MonthYear
  '2024',        // 3: Year
  '2024.4153',   // 4: FractionDate
  'RUS',         // 5: Actor1Code
  'RUSSIA',      // 6: Actor1Name
  'RUS',         // 7: Actor1CountryCode
  '',            // 8: Actor1KnownGroupCode
  '',            // 9: Actor1EthnicCode
  '',            // 10: Actor1Religion1Code
  '',            // 11: Actor1Religion2Code
  'GOV',         // 12: Actor1Type1Code
  '',            // 13: Actor1Type2Code
  '',            // 14: Actor1Type3Code
  'UKR',         // 15: Actor2Code
  'UKRAINE',     // 16: Actor2Name
  'UKR',         // 17: Actor2CountryCode
  '',            // 18: Actor2KnownGroupCode
  '',            // 19: Actor2EthnicCode
  '',            // 20: Actor2Religion1Code
  '',            // 21: Actor2Religion2Code
  'GOV',         // 22: Actor2Type1Code
  '',            // 23: Actor2Type2Code
  '',            // 24: Actor2Type3Code
  '1',           // 25: IsRootEvent
  '190',         // 26: EventCode
  '19',          // 27: EventBaseCode
  '19',          // 28: EventRootCode
  '4',           // 29: QuadClass
  '-10',         // 30: GoldsteinScale
  '15',          // 31: NumMentions
  '3',           // 32: NumSources
  '15',          // 33: NumArticles
  '-4.5',        // 34: AvgTone
  '4',           // 35: Actor1Geo_Type
  'Kharkiv, Ukraine', // 36: Actor1Geo_FullName
  'UP',          // 37: Actor1Geo_CountryCode
  'UP07',        // 38: Actor1Geo_ADM1Code
  '13001',       // 39: Actor1Geo_ADM2Code
  '49.988',      // 40: Actor1Geo_Lat
  '36.232',      // 41: Actor1Geo_Long
  '123',         // 42: Actor1Geo_FeatureID
  '4',           // 43: Actor2Geo_Type
  'Kharkiv, Ukraine', // 44: Actor2Geo_FullName
  'UP',          // 45: Actor2Geo_CountryCode
  'UP07',        // 46: Actor2Geo_ADM1Code
  '13001',       // 47: Actor2Geo_ADM2Code
  '49.988',      // 48: Actor2Geo_Lat
  '36.232',      // 49: Actor2Geo_Long
  '123',         // 50: Actor2Geo_FeatureID
  '4',           // 51: ActionGeo_Type
  'Kharkiv, Ukraine', // 52: ActionGeo_FullName
  'UP',          // 53: ActionGeo_CountryCode
  'UP07',        // 54: ActionGeo_ADM1Code
  '13001',       // 55: ActionGeo_ADM2Code
  '49.988',      // 56: ActionGeo_Lat
  '36.232',      // 57: ActionGeo_Long
  '123',         // 58: ActionGeo_FeatureID
  '20240601120000', // 59: DATEADDED
  'https://example.com/article', // 60: SOURCEURL
].join('\t')

const SAMPLE_MENTION_ROW = [
  '1234567890',  // 0: GLOBALEVENTID
  '20240601120000', // 1: EventTimeDate
  '20240601121500', // 2: MentionTimeDate
  '1',           // 3: MentionType
  'Reuters',     // 4: MentionSourceName
  'https://reuters.com/world/ukraine-attack', // 5: MentionIdentifier
  '0',           // 6: SentenceID
  '0',           // 7
  '10',          // 8
  '50',          // 9
  '1',           // 10: InRawText
  '100',         // 11: Confidence
  '1200',        // 12: MentionDocLen
  '-3.2',        // 13: MentionDocTone
].join('\t')

describe('parseEventRow', () => {
  it('extracts globalEventId and geo fields from a valid row', () => {
    const result = parseEventRow(SAMPLE_EVENT_ROW)
    expect(result).not.toBeNull()
    expect(result!.globalEventId).toBe('1234567890')
    expect(result!.lat).toBeCloseTo(49.988)
    expect(result!.lng).toBeCloseTo(36.232)
    expect(result!.countryCode).toBe('UP')
    expect(result!.region).toBe('Kharkiv, Ukraine')
    expect(result!.actor1Name).toBe('RUSSIA')
    expect(result!.actor2Name).toBe('UKRAINE')
    expect(result!.eventCode).toBe('190')
    expect(result!.eventRootCode).toBe('19')
    expect(result!.quadClass).toBe('4')
  })

  it('returns null when coordinates are (0,0) and country unknown', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[56] = '0'   // ActionGeo_Lat
    row[57] = '0'   // ActionGeo_Long
    row[53] = 'XX'  // ActionGeo_CountryCode
    expect(parseEventRow(row.join('\t'))).toBeNull()
  })

  // Gate 1: CAMEO allowlist
  it('returns null for root codes outside the conflict allowlist (e.g. 12 = rejection)', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[28] = '12'
    expect(parseEventRow(row.join('\t'))).toBeNull()
  })

  // Gate 2: corroboration. NumSources in the 15-min export is ~always 1, so the
  // floor is 1 (presence); corroboration is carried by NumArticles below.
  it('returns null when NumSources is below minimum (0 = no source)', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[32] = '0'  // NumSources < MIN_SOURCES (1)
    expect(parseEventRow(row.join('\t'))).toBeNull()
  })

  it('accepts a single-source event when other gates pass (15-min cadence reality)', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[32] = '1'  // NumSources == MIN_SOURCES (1)
    expect(parseEventRow(row.join('\t'))).not.toBeNull()
  })

  it('returns null when NumArticles is below minimum', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[33] = '4'  // NumArticles < MIN_ARTICLES (5)
    expect(parseEventRow(row.join('\t'))).toBeNull()
  })

  // Gate 3: Goldstein
  it('returns null when Goldstein is above maximum (mild event)', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[30] = '-3'  // above GOLDSTEIN_MAX (-4)
    expect(parseEventRow(row.join('\t'))).toBeNull()
  })

  it('accepts Goldstein at exactly the maximum', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[30] = '-4'
    expect(parseEventRow(row.join('\t'))).not.toBeNull()
  })

  // Gate 4: tone
  it('returns null when AvgTone is above ceiling (neutral/positive story)', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[34] = '-1'  // above MAX_TONE (-2)
    expect(parseEventRow(row.join('\t'))).toBeNull()
  })

  it('accepts AvgTone at exactly the ceiling', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[34] = '-2'
    expect(parseEventRow(row.join('\t'))).not.toBeNull()
  })

  // Gate 5: actor sanity
  it('returns null when Actor1Name is empty', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[6] = ''
    expect(parseEventRow(row.join('\t'))).toBeNull()
  })

  it('returns null when Actor1Name equals Actor2Name (self-referential coding artifact)', () => {
    const row = SAMPLE_EVENT_ROW.split('\t')
    row[6] = 'AUSTRALIA'
    row[16] = 'AUSTRALIA'
    expect(parseEventRow(row.join('\t'))).toBeNull()
  })
})

describe('parseMentionRow', () => {
  it('extracts GLOBALEVENTID, source name, and identifier', () => {
    const result = parseMentionRow(SAMPLE_MENTION_ROW)
    expect(result.globalEventId).toBe('1234567890')
    expect(result.sourceName).toBe('Reuters')
    expect(result.url).toBe('https://reuters.com/world/ukraine-attack')
  })
})

describe('buildTitle', () => {
  it('constructs a readable title from actor and geo fields', () => {
    expect(buildTitle('RUSSIA', 'UKRAINE', '19', 'Kharkiv, Ukraine'))
      .toBe('Russia clashed with Ukraine in Kharkiv, Ukraine')
  })

  it('uses intransitive verb when actor2 is absent', () => {
    expect(buildTitle('RUSSIA', '', '19', 'Kharkiv, Ukraine'))
      .toBe('Russia engaged in armed conflict in Kharkiv, Ukraine')
  })

  it('returns neutral location title when actor1 equals actor2', () => {
    expect(buildTitle('AUSTRALIA', 'AUSTRALIA', '19', 'Bondi Beach, Australia'))
      .toBe('Armed clash reported in Bondi Beach, Australia')
  })

  it('returns neutral title when actor1 is empty', () => {
    expect(buildTitle('', 'UKRAINE', '19', 'Kyiv'))
      .toBe('Armed clash reported in Kyiv')
  })

  it('removes a2 and uses intransitive form when actor2 has a religion code', () => {
    // actor2 identified by religion code → treated as anonymous
    expect(buildTitle('GUNMEN', 'JEWISH', '19', 'Tel Aviv', '', '', '', 'JEW'))
      .toBe('Gunmen engaged in armed conflict in Tel Aviv')
  })

  it('returns neutral title when actor1 has an ethnic code', () => {
    expect(buildTitle('KURDISH', 'TURKEY', '18', 'Southeast Turkey', 'KRD', '', '', ''))
      .toBe('Assault reported in Southeast Turkey')
  })

  it('removes religious actor name even without a code (name-based blocklist)', () => {
    // "MUSLIM" as an actor name is in the ethnic/religion name blocklist
    expect(buildTitle('RUSSIA', 'MUSLIM', '19', 'Chechnya'))
      .toBe('Russia engaged in armed conflict in Chechnya')
  })
})

describe('joinEventsAndMentions', () => {
  const baseEvent: EventRow = {
    globalEventId: 'EVT001',
    lat: 49.988,
    lng: 36.232,
    countryCode: 'UP',
    region: 'Kharkiv, Ukraine',
    actor1Name: 'RUSSIA',
    actor1EthnicCode: '',
    actor1Religion1Code: '',
    actor2Name: 'UKRAINE',
    actor2EthnicCode: '',
    actor2Religion1Code: '',
    eventCode: '190',
    eventRootCode: '19',
    quadClass: '4',
    goldsteinScale: -10,
    avgTone: -4.5,
    publishedAt: new Date('2024-06-01T12:00:00Z'),
  }

  const baseMention: MentionRow = {
    globalEventId: 'EVT001',
    sourceName: 'Reuters',
    url: 'https://reuters.com/world/ukraine-attack',
    publishedAt: new Date('2024-06-01T12:15:00Z'),
  }

  it('a mention matched to an event produces one NormalizedEvent with the right fields', () => {
    const results = joinEventsAndMentions([baseEvent], [baseMention])
    expect(results).toHaveLength(1)
    const r = results[0]
    expect(r.globalEventId).toBe('EVT001')
    expect(r.url).toBe('https://reuters.com/world/ukraine-attack')
    expect(r.sourceName).toBe('Reuters')
    expect(r.lat).toBeCloseTo(49.988)
    expect(r.lng).toBeCloseTo(36.232)
    expect(r.countryCode).toBe('UP')
    expect(r.region).toBe('Kharkiv, Ukraine')
    expect(r.actor1Name).toBe('RUSSIA')
    expect(r.actor1EthnicCode).toBe('')
    expect(r.actor2Name).toBe('UKRAINE')
    expect(r.actor2EthnicCode).toBe('')
    expect(r.eventCode).toBe('190')
    expect(r.eventRootCode).toBe('19')
    expect(r.quadClass).toBe('4')
    expect(r.goldsteinScale).toBe(-10)
    expect(r.avgTone).toBe(-4.5)
  })

  it('two mentions for the same event produce two NormalizedEvents', () => {
    const mention2: MentionRow = {
      globalEventId: 'EVT001',
      sourceName: 'BBC',
      url: 'https://bbc.com/news/ukraine',
      publishedAt: new Date('2024-06-01T13:00:00Z'),
    }
    const results = joinEventsAndMentions([baseEvent], [baseMention, mention2])
    expect(results).toHaveLength(2)
    expect(results[0].sourceName).toBe('Reuters')
    expect(results[1].sourceName).toBe('BBC')
  })

  it('a mention with no matching event is skipped', () => {
    const orphanMention: MentionRow = {
      globalEventId: 'NO_SUCH_EVENT',
      sourceName: 'Reuters',
      url: 'https://reuters.com/unmatched',
      publishedAt: new Date('2024-06-01T12:15:00Z'),
    }
    const results = joinEventsAndMentions([baseEvent], [orphanMention])
    expect(results).toHaveLength(0)
  })
})

describe('geo drop counter', () => {
  it('counts rows dropped for unresolvable coordinates, and resets on read', async () => {
    const { getAndResetGeoDropCount } = await import('./normalize.js')
    getAndResetGeoDropCount() // clear any prior state

    const row = SAMPLE_EVENT_ROW.split('\t')
    row[56] = '0'   // ActionGeo_Lat
    row[57] = '0'   // ActionGeo_Long
    row[53] = 'XX'  // unknown country — no centroid fallback
    parseEventRow(row.join('\t'))
    parseEventRow(row.join('\t'))

    expect(getAndResetGeoDropCount()).toBe(2)
    expect(getAndResetGeoDropCount()).toBe(0)
  })

  it('does not count rows dropped by noise gates', async () => {
    const { getAndResetGeoDropCount } = await import('./normalize.js')
    getAndResetGeoDropCount()

    const row = SAMPLE_EVENT_ROW.split('\t')
    row[28] = '12' // CAMEO gate rejects before geo resolution
    parseEventRow(row.join('\t'))

    expect(getAndResetGeoDropCount()).toBe(0)
  })
})
