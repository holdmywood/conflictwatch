import { NextResponse } from 'next/server'
import { prisma, type Prisma } from '@conflictwatch/db'

const PAGE_SIZE = 20

function toEndOfDay(dateStr: string): Date {
  const d = new Date(dateStr)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const region     = searchParams.get('region')
  const eventType  = searchParams.get('eventType')
  const confidence = searchParams.get('confidence')
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const cursor     = searchParams.get('cursor')

  const where: Prisma.EventWhereInput = {}

  if (region)     where.region     = { contains: region, mode: 'insensitive' }
  if (eventType)  where.eventType  = eventType
  if (confidence) where.confidence = confidence
  if (from || to) {
    where.publishedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: toEndOfDay(to) } : {}),
    }
  }

  const events = await prisma.event.findMany({
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where,
    orderBy: [
      { publishedAt: 'desc' },
      { id: 'desc' },
    ],
    include: {
      sources: {
        select: { id: true, name: true, url: true },
        take: 5,
      },
      _count: { select: { sources: true } },
    },
  })

  const hasMore    = events.length > PAGE_SIZE
  const items      = hasMore ? events.slice(0, PAGE_SIZE) : events
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return NextResponse.json({ events: items, nextCursor })
}
