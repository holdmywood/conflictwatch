export interface NormalizedEvent {
  globalEventId: string
  url: string
  sourceName: string
  publishedAt: Date
  lat: number
  lng: number
  region: string
  countryCode: string
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
  // Set by trust gate before classify
  sourceTier: string
}

export interface DataSource {
  name: string
  fetch(): Promise<NormalizedEvent[]>
}
