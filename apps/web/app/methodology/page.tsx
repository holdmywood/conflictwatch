'use client'

import { useEffect, useState } from 'react'

interface MethodologyData {
  totalSignals: number
  totalResolved: number
  pendingResolution: number
  meanBrierScore: number | null
  reliabilityCurve: Array<{ label: string; predicted: number; actual: number; count: number }>
  modelVersion: string
  modelUpdatedAt: string | null
}

export default function MethodologyPage() {
  const [data, setData] = useState<MethodologyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/methodology')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 font-mono">
      <h1 className="text-2xl font-bold mb-1">Methodology & Calibration</h1>
      <p className="text-sm text-gray-500 mb-8">
        How ConflictWatch computes escalation probabilities and tracks accuracy over time.
      </p>

      <section className="mb-8">
        <h2 className="text-base font-semibold uppercase tracking-wide mb-3">Probability Model</h2>
        <div className="border border-amber-400 bg-amber-50 px-4 py-3 text-sm mb-4">
          <span className="font-bold text-amber-700 uppercase text-xs mr-2">Model</span>
          L2-regularized logistic regression on 5 trend features: event tempo, severity slope,
          geographic spread, source breadth, and actor count. The LLM writes the rationale;
          the number is computed deterministically from stored inputs.
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : data ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="border p-3">
              <div className="text-gray-500 text-xs mb-1">Model version</div>
              <div className="font-medium">{data.modelVersion}</div>
            </div>
            <div className="border p-3">
              <div className="text-gray-500 text-xs mb-1">Mean Brier score</div>
              <div className="font-medium">
                {data.meanBrierScore !== null ? data.meanBrierScore.toFixed(4) : '—'}
                <span className="text-gray-400 text-xs ml-1">(lower = better; 0 = perfect)</span>
              </div>
            </div>
            <div className="border p-3">
              <div className="text-gray-500 text-xs mb-1">Resolved signals</div>
              <div className="font-medium">{data.totalResolved} of {data.totalSignals} total</div>
            </div>
            <div className="border p-3">
              <div className="text-gray-500 text-xs mb-1">Pending resolution</div>
              <div className="font-medium">{data.pendingResolution}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold uppercase tracking-wide mb-3">Reliability Curve</h2>
        <p className="text-xs text-gray-500 mb-4">
          Each row shows how often events in a probability band actually escalated.
          A well-calibrated model has predicted ≈ actual in every row.
        </p>
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : data?.reliabilityCurve.length === 0 ? (
          <p className="text-sm text-gray-400">No resolved signals yet — check back after {data.pendingResolution} pending signals resolve.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-1 pr-4">Predicted band</th>
                <th className="py-1 pr-4 text-right">Predicted midpoint</th>
                <th className="py-1 pr-4 text-right">Actual rate</th>
                <th className="py-1 text-right">n</th>
              </tr>
            </thead>
            <tbody>
              {data?.reliabilityCurve.map(row => (
                <tr key={row.label} className="border-b">
                  <td className="py-1 pr-4">{row.label}</td>
                  <td className="py-1 pr-4 text-right">{(row.predicted * 100).toFixed(0)}%</td>
                  <td className="py-1 pr-4 text-right">{(row.actual * 100).toFixed(0)}%</td>
                  <td className="py-1 text-right text-gray-500">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="text-xs text-gray-400 border-t pt-4">
        <p className="mb-2"><strong>Features used:</strong> event tempo (events/day in 7-day window), severity slope (Δ avg-severity, first vs second half), geographic spread (distinct regions), source breadth (independent tier-1/2 sources), actor count (named actors).</p>
        <p className="mb-2"><strong>Outcome definition:</strong> A conflict is considered to have escalated if it produced a high-severity (≥4) event from a medium/high-confidence source within the signal&apos;s horizon window.</p>
        <p><strong>Brier score:</strong> (predicted probability − actual outcome)². Range 0–1; lower is better. A model predicting 50% always scores 0.25.</p>
      </section>
    </main>
  )
}
