import { NextResponse } from 'next/server'
import { prisma, type Prisma } from '@conflictwatch/db'

const PAGE_SIZE = 30

/**
 * Searchable historical archive of classified events. Point-in-time honest:
 * every event carries its publishedAt; filters never reveal anything that
 * wasn't knowable at event time. Filter by country (region substring),
 * category, minimum severity, and date range.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const country = url.searchParams.get('country')?.trim()
  const category = url.searchParams.get('category')?.trim()
  const minSeverity = parseInt(url.searchParams.get('minSeverity') ?? '', 10)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const cursor = url.searchParams.get('cursor')

  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(`${to}T23:59:59.999Z`) : null
  if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
    return NextResponse.json({ error: 'Invalid from/to date (YYYY-MM-DD).' }, { status: 400 })
  }

  const where: Prisma.EventWhereInput = { classified: true }
  if (country) where.region = { contains: country, mode: 'insensitive' }
  if (category) where.category = category
  if (Number.isFinite(minSeverity)) where.severity = { gte: minSeverity }
  if (fromDate || toDate) {
    where.publishedAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    }
  }

  const events = await prisma.event.findMany({
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, title: true, summary: true, severity: true, category: true,
      significance: true, region: true, sourceTier: true, confidence: true, publishedAt: true,
    },
  })

  const hasMore = events.length > PAGE_SIZE
  const items = hasMore ? events.slice(0, PAGE_SIZE) : events
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return NextResponse.json(
    { events: items, nextCursor },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  )
}
