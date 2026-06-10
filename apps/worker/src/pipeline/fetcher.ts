import axios from 'axios'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

const USER_AGENT =
  'ConflictWatch/1.0 (conflict intelligence aggregator; contact: admin@conflictwatch.io)'

const FETCH_TIMEOUT_MS = 10_000
const MAX_LEAD_CHARS = 1_500 // ~375 tokens; headline + first paragraph

export interface LeadText {
  headline: string
  lead: string    // first paragraph of article body
  sourceDomain: string
}

// Fetch the article at url and extract headline + lead paragraph.
// Returns null on paywall, network failure, missing content, or any extraction error.
// Never retries — caller should try the next source URL in the cluster.
export async function fetchLeadText(url: string): Promise<LeadText | null> {
  let html: string
  let sourceDomain: string

  try {
    const parsed = new URL(url)
    sourceDomain = parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }

  try {
    const response = await axios.get<string>(url, {
      responseType: 'text',
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxContentLength: 2 * 1024 * 1024, // 2 MB limit
      validateStatus: s => s === 200,
    })
    html = response.data
  } catch {
    // Network error, timeout, redirect loop, non-200 (paywall redirects, 403, etc.)
    return null
  }

  try {
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document, {
      charThreshold: 300,
    })
    const article = reader.parse()

    if (!article) return null

    const headline = article.title?.trim() ?? ''
    // Extract first ~1500 chars of text content as the lead
    const rawContent = article.textContent ?? ''
    const lead = rawContent
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_LEAD_CHARS)

    if (!headline && !lead) return null

    return { headline, lead, sourceDomain }
  } catch {
    return null
  }
}

// Try each URL in order of tier preference; return the first successful extraction.
// Returns null if all fail — callers should drop the event in this case.
export async function fetchBestLeadText(
  urls: string[],
): Promise<LeadText | null> {
  for (const url of urls) {
    const result = await fetchLeadText(url)
    if (result) return result
  }
  return null
}
