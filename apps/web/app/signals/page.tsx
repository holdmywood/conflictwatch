import { prisma } from '@conflictwatch/db'
import TerminalShell from '../components/TerminalShell'
import SignalsView from './SignalsView'

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

  return (
    <TerminalShell
      sidebar={
        <div className="py-2">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
            Active signals
          </div>
          {conflictsWithSignals.map(({ conflict, signal }) => (
            <a
              key={conflict.id}
              href={`#${conflict.id}`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-[#1e2533] transition-colors"
            >
              {/* Severity dot */}
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: (['', '#64748b', '#ca8a04', '#ea580c', '#7c3aed', '#991b1b'] as const)[conflict.threatLevel] ?? '#64748b' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono truncate text-white">{conflict.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {signal.pEscalation !== null ? `${Math.round(signal.pEscalation * 100)}% P(esc)` : signal.escalationRisk}
                </div>
              </div>
            </a>
          ))}
        </div>
      }
      main={
        <SignalsView conflictsWithSignals={conflictsWithSignals} />
      }
    />
  )
}
