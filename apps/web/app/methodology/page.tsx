'use client'

import { useEffect, useState } from 'react'
import TerminalShell from '../components/TerminalShell'
import Panel from '../components/Panel'
import { fmtInt, fmtUTC } from '../lib/tokens'

interface MethodologyData {
  totalSignals: number
  totalResolved: number
  pendingResolution: number
  meanBrierScore: number | null
  reliabilityCurve: Array<{ label: string; predicted: number; actual: number; count: number }>
  modelVersion: string
  modelUpdatedAt: string | null
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="border p-2.5" style={{ borderColor: 'var(--border)' }}>
      <div className="label mb-1">{label}</div>
      <div className="tabnum text-[15px] font-medium" style={{ color: 'var(--text)' }}>{value}</div>
      {note && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{note}</div>}
    </div>
  )
}

/** Reliability plot: predicted vs observed escalation rate per probability bin. */
function CalibrationChart({ curve }: { curve: MethodologyData['reliabilityCurve'] }) {
  const S = 220   // plot size
  const M = 26    // margin for axis labels
  const x = (v: number) => M + v * S
  const y = (v: number) => M + (1 - v) * S

  return (
    <svg
      width={S + M * 2}
      height={S + M * 2}
      role="img"
      aria-label="Calibration plot: predicted probability versus observed escalation rate"
      className="shrink-0"
    >
      {/* frame */}
      <rect x={M} y={M} width={S} height={S} fill="none" stroke="var(--border)" />
      {/* gridlines at 25/50/75 */}
      {[0.25, 0.5, 0.75].map(t => (
        <g key={t}>
          <line x1={x(t)} y1={y(0)} x2={x(t)} y2={y(1)} stroke="var(--border)" strokeDasharray="2 4" />
          <line x1={x(0)} y1={y(t)} x2={x(1)} y2={y(t)} stroke="var(--border)" strokeDasharray="2 4" />
        </g>
      ))}
      {/* perfect-calibration diagonal */}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--border-strong)" strokeDasharray="4 3" />
      <text
        x={x(0.58)} y={y(0.64)}
        fill="var(--text-3)" fontSize="9" fontFamily="var(--font-mono)"
        transform={`rotate(-45 ${x(0.58)} ${y(0.64)})`}
      >
        perfect calibration
      </text>
      {/* observed points, area ∝ n */}
      {curve.map(b => (
        <circle
          key={b.label}
          cx={x(b.predicted)}
          cy={y(b.actual)}
          r={3 + Math.min(4, Math.sqrt(b.count))}
          fill="var(--fc-mid)"
          fillOpacity={0.85}
        >
          <title>{`${b.label}: observed ${(b.actual * 100).toFixed(0)}% over n=${b.count}`}</title>
        </circle>
      ))}
      {/* axis labels */}
      {[0, 0.5, 1].map(t => (
        <g key={t}>
          <text x={x(t)} y={M + S + 14} fill="var(--text-3)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">
            {t * 100}
          </text>
          <text x={M - 6} y={y(t) + 3} fill="var(--text-3)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">
            {t * 100}
          </text>
        </g>
      ))}
      <text x={M + S / 2} y={M + S + 26} fill="var(--text-2)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">
        predicted %
      </text>
      <text x={9} y={M + S / 2} fill="var(--text-2)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle" transform={`rotate(-90 9 ${M + S / 2})`}>
        observed %
      </text>
    </svg>
  )
}

export default function MethodologyPage() {
  const [data, setData] = useState<MethodologyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/methodology')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <TerminalShell>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        <div className="max-w-3xl space-y-1.5">
          <Panel title="Probability model">
            <p className="text-[12.5px] leading-relaxed max-w-[68ch] mb-2.5" style={{ color: 'var(--text)' }}>
              Escalation probabilities come from a logistic model over five trend
              features: event tempo, severity slope, geographic spread, source breadth, and actor count.
              The language model writes the rationale; the number is computed deterministically from
              stored inputs and is reproducible from the signal&apos;s provenance record.
            </p>
            {data?.modelVersion.includes('prior') && (
              <p className="text-[12px] leading-relaxed max-w-[68ch] mb-2.5" style={{ color: 'var(--text-2)' }}>
                The current weights are hand-set domain priors, not fitted coefficients — no resolved
                outcomes have trained the model yet. Intervals are held at ±25 points until they can be
                derived from observed calibration.
              </p>
            )}
            {loading ? (
              <p className="tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
            ) : error ? (
              <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>Calibration service unreachable. Reload to retry.</p>
            ) : data ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <Stat label="Model" value={data.modelVersion} note={data.modelUpdatedAt ? `as of ${fmtUTC(data.modelUpdatedAt)}` : undefined} />
                <Stat
                  label="Mean Brier"
                  value={data.meanBrierScore !== null ? data.meanBrierScore.toFixed(4) : '—'}
                  note="0 = perfect · 0.25 = coin flip"
                />
                <Stat label="Resolved" value={`${fmtInt(data.totalResolved)} / ${fmtInt(data.totalSignals)}`} note="signals with known outcome" />
                <Stat label="Pending" value={fmtInt(data.pendingResolution)} note="awaiting horizon close" />
              </div>
            ) : null}
          </Panel>

          <Panel title="Calibration">
            {loading ? (
              <p className="tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
            ) : !data || data.reliabilityCurve.length === 0 ? (
              <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                No resolved signals yet.
                {data && data.pendingResolution > 0
                  ? ` The curve appears once the ${fmtInt(data.pendingResolution)} pending signal${data.pendingResolution !== 1 ? 's' : ''} resolve.`
                  : ' The curve appears once signals resolve against observed outcomes.'}
              </p>
            ) : (
              <div className="flex flex-col lg:flex-row gap-4 items-start">
                <CalibrationChart curve={data.reliabilityCurve} />
                <table className="border-collapse flex-1 w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border-strong)' }}>
                      <th className="label text-left font-normal py-1 pr-3">Band</th>
                      <th className="label text-right font-normal py-1 pr-3">Predicted</th>
                      <th className="label text-right font-normal py-1 pr-3">Observed</th>
                      <th className="label text-right font-normal py-1">n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reliabilityCurve.map(row => (
                      <tr key={row.label} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="tabnum text-[11px] py-1 pr-3" style={{ color: 'var(--text-2)' }}>{row.label}</td>
                        <td className="tabnum text-[11px] py-1 pr-3 text-right" style={{ color: 'var(--text)' }}>{(row.predicted * 100).toFixed(0)}%</td>
                        <td className="tabnum text-[11px] py-1 pr-3 text-right" style={{ color: 'var(--text)' }}>{(row.actual * 100).toFixed(0)}%</td>
                        <td className="tabnum text-[11px] py-1 text-right" style={{ color: 'var(--text-3)' }}>{fmtInt(row.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Definitions">
            <dl className="space-y-2 text-[12px] leading-relaxed max-w-[72ch]">
              <div>
                <dt className="label mb-0.5">Features</dt>
                <dd style={{ color: 'var(--text-2)' }}>
                  Event tempo (events/day, 7-day window) · severity slope (Δ mean severity, first vs second half) ·
                  geographic spread (distinct regions) · source breadth (independent tier-1/2 sources) · actor count (named actors).
                </dd>
              </div>
              <div>
                <dt className="label mb-0.5">Escalation outcome</dt>
                <dd style={{ color: 'var(--text-2)' }}>
                  A conflict escalated if it produced a severity-4-or-higher event from a medium/high-confidence
                  source within the signal&apos;s horizon window.
                </dd>
              </div>
              <div>
                <dt className="label mb-0.5">Brier score</dt>
                <dd style={{ color: 'var(--text-2)' }}>
                  (predicted probability − actual outcome)², range 0–1, lower is better.
                  A model that always predicts 50% scores 0.2500.
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </TerminalShell>
  )
}
