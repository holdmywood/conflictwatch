import { prisma } from '@conflictwatch/db'
import TerminalShell from '../components/TerminalShell'
import SignalsView from './SignalsView'
import SevMark from '../components/SevMark'
import { forecastColor, fmtPct } from '../lib/tokens'

export const dynamic = 'force-dynamic'

export default async function SignalsPage() {
  // Fetch conflicts with their latest escalation signals
  const conflicts = await prisma.conflict.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, region: true, threatLevel: true, currentSituationLine: true, updatedAt: true,
    },
  })

  // Latest signal per conflict (one query, post-processed)
  const signals = await prisma.escalationSignal.findMany({
    where: { targetId: { in: conflicts.map(c => c.id) } },
    orderBy: { computedAt: 'desc' },
    select: {
      id: true, targetId: true, escalationRisk: true, pEscalation: true,
      ciLow: true, ciHigh: true, horizonDays: true, modelVersion: true,
      trajectory: true, drivers: true, actorsOfConcern: true, rationale: true,
      computedAt: true, usedEventIds: true,
    },
  })

  // Keep only the latest signal per conflict
  const latestByConflict = new Map<string, typeof signals[0]>()
  for (const s of signals) {
    if (!latestByConflict.has(s.targetId)) latestByConflict.set(s.targetId, s)
  }

  // Serialize for client components: convert Date → string
  const conflictsWithSignals = conflicts
    .map(c => {
      const s = latestByConflict.get(c.id)
      if (!s) return null
      return {
        conflict: {
          id: c.id,
          name: c.name,
          region: c.region,
          threatLevel: c.threatLevel,
          currentSituationLine: c.currentSituationLine,
        },
        signal: {
          id: s.id,
          targetId: s.targetId,
          escalationRisk: s.escalationRisk,
          pEscalation: s.pEscalation,
          ciLow: s.ciLow,
          ciHigh: s.ciHigh,
          horizonDays: s.horizonDays,
          modelVersion: s.modelVersion,
          trajectory: s.trajectory,
          drivers: s.drivers,
          actorsOfConcern: s.actorsOfConcern,
          rationale: s.rationale,
          computedAt: s.computedAt.toISOString(),
          usedEventIds: s.usedEventIds,
        },
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => (b.signal.pEscalation ?? -1) - (a.signal.pEscalation ?? -1))

  return (
    <TerminalShell
      sidebar={
        <div className="py-1.5">
          <div className="flex items-baseline justify-between px-2.5 py-1">
            <span className="label">Active signals</span>
            <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{conflictsWithSignals.length}</span>
          </div>
          <ul>
            {conflictsWithSignals.map(({ conflict, signal }) => (
              <li key={conflict.id}>
                <a
                  href={`#${conflict.id}`}
                  className="flex items-center gap-2 px-2.5 py-[7px]"
                >
                  <SevMark level={conflict.threatLevel} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] leading-tight truncate" style={{ color: 'var(--text)' }}>
                      {conflict.name}
                    </span>
                    <span className="block text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
                      {conflict.region}
                    </span>
                  </span>
                  <span
                    className="tabnum text-[11px] shrink-0"
                    style={{ color: signal.pEscalation !== null ? forecastColor(signal.pEscalation) : 'var(--text-3)' }}
                  >
                    {signal.pEscalation !== null ? fmtPct(signal.pEscalation) : signal.escalationRisk.toUpperCase()}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <SignalsView conflictsWithSignals={conflictsWithSignals} />
    </TerminalShell>
  )
}
