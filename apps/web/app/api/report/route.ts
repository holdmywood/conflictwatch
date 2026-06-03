import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'date param required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  const start = new Date(`${date}T00:00:00.000Z`)
  const end = new Date(`${date}T23:59:59.999Z`)

  if (isNaN(start.getTime())) {
    return NextResponse.json(
      { error: 'date param required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  const reports = await prisma.assessment.findMany({
    where: {
      kind: 'dailyReport',
      createdAt: { gte: start, lte: end },
    },
    orderBy: { region: 'asc' },
  })

  return NextResponse.json({ reports })
}
