import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET() {
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const events = await prisma.event.findMany({
    where: {
      classified: true,
      signalAt: { gte: windowStart, not: null },
      firstReportAt: { not: null },
    },
    select: {
      firstReportAt: true,
      signalAt: true,
    },
  })

  const diffs = events
    .filter((e) => e.firstReportAt !== null && e.signalAt !== null)
    .map((e) => (e.signalAt!.getTime() - e.firstReportAt!.getTime()) / 60_000)

  let medianLeadTimeMinutes: number | null = null
  if (diffs.length > 0) {
    diffs.sort((a, b) => a - b)
    const mid = Math.floor(diffs.length / 2)
    medianLeadTimeMinutes =
      diffs.length % 2 === 0
        ? (diffs[mid - 1] + diffs[mid]) / 2
        : diffs[mid]
  }

  return NextResponse.json({
    medianLeadTimeMinutes,
    sampleSize: diffs.length,
    windowDays: 30,
    computedAt: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
