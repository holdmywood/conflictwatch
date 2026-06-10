import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET() {
  const conflicts = await prisma.conflict.findMany({
    select: {
      id: true,
      name: true,
      region: true,
      status: true,
      threatLevel: true,
      currentSituationLine: true,
      lat: true,
      lng: true,
      updatedAt: true,
    },
    where: { status: 'active' },
    orderBy: { threatLevel: 'desc' },
  })

  return NextResponse.json(conflicts, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
