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
  actor2Name: string
  eventCode: string
  eventRootCode: string
  quadClass: string
  goldsteinScale: number
  avgTone: number
}

export interface DataSource {
  name: string
  fetch(): Promise<NormalizedEvent[]>
}
