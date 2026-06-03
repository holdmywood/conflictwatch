import { describe, it, expect } from 'vitest'
import { parseEventRow, parseMentionRow, buildTitle } from './normalize.js'

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

const SAMPLE_EVENT_ROW = [
  '1234567890',  // 0: GLOBALEVENTID
  '20240601',    // 1: SQLDATE
  '202406',      // 2: MonthYear
  '2024',        // 3: Year
  '2024.4153',   // 4: FractionDate
  'RUS',         // 5: Actor1Code
  'RUSSIA',      // 6: Actor1Name
  'RUS',         // 7: Actor1CountryCode
  '',            // 8
  '',            // 9
  '',            // 10
  '',            // 11
  'GOV',         // 12
  '',            // 13
  '',            // 14
  'UKR',         // 15: Actor2Code
  'UKRAINE',     // 16: Actor2Name
  'UKR',         // 17
  '',            // 18
  '',            // 19
  '',            // 20
  '',            // 21
  'GOV',         // 22
  '',            // 23
  '',            // 24
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
  it('extracts globalEventId and geo fields', () => {
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
    const zeroRow = SAMPLE_EVENT_ROW.split('\t')
    zeroRow[56] = '0'  // ActionGeo_Lat (61-col layout)
    zeroRow[57] = '0'  // ActionGeo_Long (61-col layout)
    zeroRow[53] = 'XX' // ActionGeo_CountryCode (61-col layout)
    const result = parseEventRow(zeroRow.join('\t'))
    expect(result).toBeNull()
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
    const title = buildTitle('RUSSIA', 'UKRAINE', 'armed-conflict', 'Kharkiv, Ukraine')
    expect(title).toBe('Russia: armed-conflict involving Ukraine in Kharkiv, Ukraine')
  })

  it('omits actor2 when empty', () => {
    const title = buildTitle('RUSSIA', '', 'armed-conflict', 'Kharkiv, Ukraine')
    expect(title).toBe('Russia: armed-conflict in Kharkiv, Ukraine')
  })
})
