import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET() {
  const heartbeat = await prisma.heartbeat.findUnique({ where: { id: 1 } })

  if (!heartbeat) {
    return NextResponse.json({ lastIngestedAt: null, sourcesOk: 0, sourcesFailed: 0 })
  }

  return NextResponse.json({
    lastIngestedAt: heartbeat.lastIngestedAt,
    sourcesOk: heartbeat.sourcesOk,
    sourcesFailed: heartbeat.sourcesFailed,
  })
}
