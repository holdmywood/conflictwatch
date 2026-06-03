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

  return NextResponse.json({ predictions: [...byRegion.values()] })
}
