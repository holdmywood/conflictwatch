'use client'

import SignalCard, { type Signal, type SignalConflict } from '../components/SignalCard'

export default function SignalsView({
  conflictsWithSignals,
}: {
  conflictsWithSignals: Array<{ conflict: SignalConflict; signal: Signal }>
}) {
  if (conflictsWithSignals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-[12px] max-w-sm text-center" style={{ color: 'var(--text-3)' }}>
          No escalation signals yet. Signals compute after the worker&apos;s first ingestion cycle — check the event tape on the overview for ingest progress.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
      <div className="grid gap-1.5 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 items-start">
        {conflictsWithSignals.map(({ conflict, signal }) => (
          <div key={conflict.id} id={conflict.id} className="scroll-mt-2">
            <SignalCard conflict={conflict} signal={signal} />
          </div>
        ))}
      </div>
    </div>
  )
}
