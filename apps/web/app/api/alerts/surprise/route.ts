import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const minScore = parseFloat(searchParams.get('minScore') ?? '3')
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))

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
