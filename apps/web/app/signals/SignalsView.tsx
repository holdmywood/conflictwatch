'use client'

import SignalCard from '../components/SignalCard'

interface ConflictSummary {
  id: string; name: string; region: string; threatLevel: number; currentSituationLine: string
}

interface SignalSummary {
  id: string; targetId: string; escalationRisk: string; pEscalation: number | null;
  ciLow: number | null; ciHigh: number | null; horizonDays: number | null; modelVersion: string;
  trajectory: string; drivers: string[]; actorsOfConcern: string[]; rationale: string;
  computedAt: string; usedEventIds: string[];
}

export default function SignalsView({
  conflictsWithSignals,
}: {
  conflictsWithSignals: Array<{ conflict: ConflictSummary; signal: SignalSummary }>
}) {
  if (conflictsWithSignals.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--text-muted)' }}>
        No escalation signals yet. The worker will generate signals after the first ingestion cycle.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {conflictsWithSignals.map(({ conflict, signal }) => (
        <div key={conflict.id} id={conflict.id}>
          <SignalCard
            conflict={conflict}
            signal={signal}
          />
        </div>
      ))}
    </div>
  )
}
