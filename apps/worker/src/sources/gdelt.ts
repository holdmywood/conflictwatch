import axios from 'axios'
import { createGunzip } from 'zlib'
import { Readable } from 'stream'
import { parseEventRow, parseMentionRow, joinEventsAndMentions } from '../pipeline/normalize.js'
import type { DataSource, NormalizedEvent } from '../types.js'

const LASTUPDATE_URL = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt'

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
  const buffer = Buffer.from(response.data)

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const gunzip = createGunzip()
    const readable = Readable.from(buffer)
    readable.pipe(gunzip)
    gunzip.on('data', (chunk: Buffer) => chunks.push(chunk))
    gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    gunzip.on('error', reject)
  })
}

export class GdeltSource implements DataSource {
  name = 'GDELT'

  async fetch(): Promise<NormalizedEvent[]> {
    const indexText = (
      await axios.get<string>(LASTUPDATE_URL, { responseType: 'text', timeout: 15000 })
    ).data
    const { eventsUrl, mentionsUrl } = extractTsvUrls(indexText)

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

    return joinEventsAndMentions(eventRows, mentionRows)
  }
}
