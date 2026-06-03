import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const conflict = await prisma.conflict.findUnique({
    where: { id },
  })

  if (!conflict) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const events = await prisma.event.findMany({
    where: { conflictId: id },
    include: { sources: { take: 5 } },
    orderBy: { publishedAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({ conflict, events })
}
