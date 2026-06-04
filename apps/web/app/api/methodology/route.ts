import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET() {
  // All resolved calibration records
  const resolved = await prisma.calibrationRecord.findMany({
    where: { resolvedAt: { not: null }, actualOutcome: { not: null } },
    select: { pEscalation: true, actualOutcome: true, brierScore: true, modelVersion: true, computedAt: true },
    orderBy: { computedAt: 'asc' },
  })

  const totalResolved = resolved.length
  const meanBrier = totalResolved > 0
    ? resolved.reduce((s, r) => s + (r.brierScore ?? 0), 0) / totalResolved
    : null

  // Reliability curve: bin by decile, compute actual escalation rate per bin
  const bins: Array<{ label: string; predicted: number; actual: number; count: number }> = []
  for (let i = 0; i < 10; i++) {
    const lo = i / 10
    const hi = (i + 1) / 10
    const inBin = resolved.filter(r => r.pEscalation >= lo && r.pEscalation < hi)
    if (inBin.length === 0) continue
    const actualRate = inBin.filter(r => r.actualOutcome).length / inBin.length
    bins.push({
      label: `${lo * 100}–${hi * 100}%`,
      predicted: Math.round((lo + hi) / 2 * 100) / 100,
      actual: Math.round(actualRate * 100) / 100,
      count: inBin.length,
    })
  }

  // All-time signal counts (for context)
  const totalSignals = await prisma.escalationSignal.count()
  const pendingResolution = await prisma.calibrationRecord.count({ where: { resolvedAt: null } })

  // Most recent model version in use
  const latestSignal = await prisma.escalationSignal.findFirst({
    orderBy: { computedAt: 'desc' },
    select: { modelVersion: true, computedAt: true },
  })

  return NextResponse.json({
    totalSignals,
    totalResolved,
    pendingResolution,
    meanBrierScore: meanBrier !== null ? Math.round(meanBrier * 10000) / 10000 : null,
    reliabilityCurve: bins,
    modelVersion: latestSignal?.modelVersion ?? 'v0-logistic',
    modelUpdatedAt: latestSignal?.computedAt ?? null,
  })
}
