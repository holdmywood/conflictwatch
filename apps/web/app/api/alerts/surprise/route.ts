import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsedMinScore = parseFloat(searchParams.get('minScore') ?? '3')
  const minScore = Number.isFinite(parsedMinScore) ? parsedMinScore : 3
  const parsedLimit = parseInt(searchParams.get('limit') ?? '20', 10)
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 20

  const alerts = await prisma.event.findMany({
    where: {
      surpriseScore: { gte: minScore },
    },
    orderBy: { surpriseScore: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      severity: true,
      region: true,
      surpriseScore: true,
      publishedAt: true,
      conflictId: true,
    },
  })

  const total = await prisma.event.count({
    where: {
      surpriseScore: { gte: minScore },
    },
  })

  return NextResponse.json({ alerts, total })
}
