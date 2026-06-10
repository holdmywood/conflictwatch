'use client'

import { useEffect, useState } from 'react'
import TerminalShell from '../components/TerminalShell'
import AssessmentCard from './components/AssessmentCard'

interface Assessment {
  id: string
  region: string
  conflictName: string
  body: string
  confidence: string
  createdAt: string
  usedEventIds: string[]
}

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = () => {
    setLoading(true)
    setError(false)
    fetch('/api/predictions')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setPredictions(d.predictions))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <TerminalShell>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        <div className="max-w-3xl space-y-1.5">
          {loading && (
            <p className="tabnum text-[11px] p-2" style={{ color: 'var(--text-3)' }}>Loading forecasts…</p>
          )}
          {error && (
            <div className="p-2 flex items-center gap-3">
              <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>Forecast service unreachable.</p>
              <button
                onClick={load}
                className="tabnum text-[10px] uppercase tracking-[0.08em] px-2 py-1 border"
                style={{ color: 'var(--text-2)', borderColor: 'var(--border-strong)' }}
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && predictions.length === 0 && (
            <p className="text-[12px] p-2" style={{ color: 'var(--text-3)' }}>
              No forecasts yet. Assessments generate after the worker&apos;s next run.
            </p>
          )}
          {predictions.map(p => (
            <AssessmentCard
              key={p.id}
              region={p.conflictName}
              body={p.body}
              confidence={p.confidence}
              createdAt={p.createdAt}
              usedEventIds={p.usedEventIds}
            />
          ))}
        </div>
      </div>
    </TerminalShell>
  )
}
