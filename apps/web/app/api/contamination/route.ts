import { NextResponse } from 'next/server'
import { countryCentroid } from '../../lib/countries'

/**
 * Contamination feed from WHO Disease Outbreak News (DON).
 *
 * WHO DON is the authoritative public surveillance feed. We take WHO's own
 * factual headline + link, parse disease and affected countries from it, and
 * geolocate each country — we do NOT republish WHO article bodies (licensing:
 * link out, summarize in original wording only). Confirmed-case counts are not
 * in the list endpoint and are intentionally omitted rather than guessed.
 */

export interface Outbreak {
  id: string
  disease: string
  countries: string[]
  points: Array<{ country: string; lat: number; lng: number }>
  title: string
  publishedAt: string
  url: string
  source: 'WHO'
}

const WHO_DON_URL =
  'https://www.who.int/api/news/diseaseoutbreaknews?%24orderby=PublicationDateAndTime%20desc&%24top=40'

interface WhoItem {
  Title?: string
  OverrideTitle?: string
  ItemDefaultUrl?: string
  UrlName?: string
  PublicationDateAndTime?: string
}

// WHO house style: "Disease, Country A & Country B" or "Disease – Country".
// Split disease from the geographic tail on the first comma or dash, then
// pull recognised country names from the tail.
function parseTitle(title: string): { disease: string; countries: string[] } {
  const sep = title.search(/[,–—-]/)
  if (sep === -1) return { disease: title.trim(), countries: [] }
  const disease = title.slice(0, sep).trim()
  const tail = title.slice(sep + 1)
  const candidates = tail
    .split(/,|&|–|—|\band\b/)
    .map(s => s.trim())
    .filter(Boolean)
  const countries = candidates.filter(c => countryCentroid(c) !== null)
  return { disease, countries }
}

export async function GET() {
  let items: WhoItem[]
  try {
    const res = await fetch(WHO_DON_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 1800 },
    })
    if (!res.ok) throw new Error(`WHO ${res.status}`)
    const data = (await res.json()) as { value?: WhoItem[] }
    items = data.value ?? []
  } catch {
    return NextResponse.json(
      { outbreaks: [], source: 'unavailable', asOf: new Date().toISOString() },
      { status: 200 }
    )
  }

  const outbreaks: Outbreak[] = items.map(it => {
    const title = (it.OverrideTitle || it.Title || '').trim()
    const { disease, countries } = parseTitle(title)
    const points = countries
      .map(c => {
        const centroid = countryCentroid(c)
        return centroid ? { country: c, lat: centroid[0], lng: centroid[1] } : null
      })
      .filter((p): p is { country: string; lat: number; lng: number } => p !== null)
    return {
      id: `who-${it.UrlName ?? title.slice(0, 24)}`,
      disease,
      countries,
      points,
      title,
      publishedAt: it.PublicationDateAndTime ?? new Date(0).toISOString(),
      url: `https://www.who.int${it.ItemDefaultUrl ?? ''}`,
      source: 'WHO' as const,
    }
  })

  return NextResponse.json(
    { outbreaks, source: 'ok', asOf: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } }
  )
}
