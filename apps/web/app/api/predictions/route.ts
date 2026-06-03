import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET() {
  // 25-hour window ensures we catch assessments from the last full cycle
  const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000)

  const all = await prisma.assessment.findMany({
    where: { kind: 'prediction', createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
  })

  // Keep only the latest prediction per region
  const byRegion = new Map<string, (typeof all)[0]>()
  for (const assessment of all) {
    if (!byRegion.has(assessment.region)) {
      byRegion.set(assessment.region, assessment)
    }
  }

  const predictions = [...byRegion.values()]

  // Enrich with conflict names
  const conflictIds = [...new Set(predictions.map(p => p.region))]
  const conflicts = await prisma.conflict.findMany({
    where: { id: { in: conflictIds } },
    select: { id: true, name: true },
  })
  const nameById = new Map(conflicts.map(c => [c.id, c.name]))

  const enriched = predictions.map(p => ({
    ...p,
    conflictName: nameById.get(p.region) ?? p.region,
  }))

  return NextResponse.json({ predictions: enriched })
}
