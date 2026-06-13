import axios from 'axios'
import AdmZip from 'adm-zip'
import { parseEventRow, parseMentionRow, joinEventsAndMentions } from '../pipeline/normalize.js'
import { clusterHasTrustedSource, bestTier, extractDomain, recordDomainUsage } from '../pipeline/trust.js'
import type { DataSource, NormalizedEvent } from '../types.js'

const LASTUPDATE_URL = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt'
const GDELT_BASE = 'http://data.gdeltproject.org/gdeltv2'

// Build the events + mentions file URLs for a specific 15-minute window.
// `ts` is a GDELT timestamp: YYYYMMDDHHMMSS aligned to :00/:15/:30/:45 UTC.
export function windowUrls(ts: string): { eventsUrl: string; mentionsUrl: string } {
  return {
    eventsUrl: `${GDELT_BASE}/${ts}.export.CSV.zip`,
    mentionsUrl: `${GDELT_BASE}/${ts}.mentions.CSV.zip`,
  }
}

export function extractTsvUrls(index: string): { eventsUrl: string; mentionsUrl: string } {
  const lines = index.trim().split('\n')
  let eventsUrl = ''
  let mentionsUrl = ''
  for (const line of lines) {
    const url = line.trim().split(/\s+/).pop() ?? ''
    if (url.includes('.export.')) eventsUrl = url
    if (url.includes('.mentions.')) mentionsUrl = url
  }
  if (!eventsUrl || !mentionsUrl) {
    throw new Error('Could not parse GDELT lastupdate.txt — unexpected format')
  }
  return { eventsUrl, mentionsUrl }
}

async function downloadAndDecompress(url: string): Promise<string> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  })
  const zip = new AdmZip(Buffer.from(response.data))
  const entries = zip.getEntries()
  if (entries.length === 0) throw new Error(`Empty ZIP archive from ${url}`)
  return entries[0].getData().toString('utf-8')
}

export class GdeltSource implements DataSource {
  name = 'GDELT'

  async fetch(): Promise<NormalizedEvent[]> {
    const indexText = (
      await axios.get<string>(LASTUPDATE_URL, { responseType: 'text', timeout: 15000 })
    ).data
    const { eventsUrl, mentionsUrl } = extractTsvUrls(indexText)
    return this.fetchFromUrls(eventsUrl, mentionsUrl)
  }

  // Fetch a specific historical 15-minute window (used by the one-week backfill).
  // Identical trust-gate + normalization to the live fetch — only the source
  // files differ. Throws if the window's files are missing (caller skips gaps).
  async fetchWindow(ts: string): Promise<NormalizedEvent[]> {
    const { eventsUrl, mentionsUrl } = windowUrls(ts)
    return this.fetchFromUrls(eventsUrl, mentionsUrl)
  }

  private async fetchFromUrls(
    eventsUrl: string,
    mentionsUrl: string,
  ): Promise<NormalizedEvent[]> {
    const [eventsTsv, mentionsTsv] = await Promise.all([
      downloadAndDecompress(eventsUrl),
      downloadAndDecompress(mentionsUrl),
    ])

    const eventLines = eventsTsv.split('\n').filter(Boolean)
    const mentionLines = mentionsTsv.split('\n').filter(Boolean)

    const eventRows = eventLines
      .map(parseEventRow)
      .filter((r): r is NonNullable<typeof r> => r !== null)
    const mentionRows = mentionLines.map(parseMentionRow)

    // Group mention URLs by cluster for trust evaluation
    const urlsByCluster = new Map<string, string[]>()
    for (const m of mentionRows) {
      const urls = urlsByCluster.get(m.globalEventId) ?? []
      urls.push(m.url)
      urlsByCluster.set(m.globalEventId, urls)
    }

    // Apply source-trust gate: reject clusters with no tier1/tier2/specialist source.
    // Record domain usage for reliability tracking.
    const passedClusterIds = new Set<string>()
    const tierByCluster = new Map<string, string>()

    for (const [clusterId, urls] of urlsByCluster) {
      // Track domain usage (best-effort, non-blocking)
      for (const url of urls) {
        const domain = extractDomain(url)
        if (domain) recordDomainUsage(domain).catch(() => {})
      }

      const trusted = await clusterHasTrustedSource(urls)
      if (trusted) {
        passedClusterIds.add(clusterId)
        const tier = await bestTier(urls)
        tierByCluster.set(clusterId, tier)
      }
    }

    // Only join events that passed the trust gate
    const trustedEventRows = eventRows.filter(e => passedClusterIds.has(e.globalEventId))

    return joinEventsAndMentions(trustedEventRows, mentionRows, tierByCluster)
  }
}
