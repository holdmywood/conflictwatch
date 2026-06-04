'use client'

import { useEffect, useState } from 'react'

interface Signal {
  id: string
  targetId: string         // conflictId
  escalationRisk: string   // 'none'|'watch'|'elevated'|'high'
  pEscalation: number | null
  ciLow: number | null
  ciHigh: number | null
  horizonDays: number | null
  modelVersion: string
  trajectory: string
  drivers: string[]
  actorsOfConcern: string[]
  rationale: string
  computedAt: string
  usedEventIds: string[]
}

interface Conflict {
  id: string
  name: string
  region: string
  threatLevel: number
  currentSituationLine: string
}

interface ExposureLink {
  zone: string
  zoneLabel: string
  instrument: string
  instrumentLabel: string
  assetClass: string
  linkType: string
  weight: number
  notes: string
}

interface AnalogueData {
  baseRate: number
  dispersion: number
  totalCandidates: number
  analogues: Array<{ episodeId: string; conflictId: string; distance: number; escalatedToNational: boolean | null }>
}

// Severity → color token
function sevColor(level: number): string {
  return ['', '#64748b', '#ca8a04', '#ea580c', '#7c3aed', '#991b1b'][level] ?? '#64748b'
}

// pEscalation → forecast color token
function forecastColor(p: number | null): string {
  if (p === null) return 'var(--forecast-low)'
  if (p < 0.2) return 'var(--forecast-low)'
  if (p < 0.5) return 'var(--forecast-mid)'
  if (p < 0.75) return 'var(--forecast-elevated)'
  return 'var(--forecast-high)'
}

// Risk label → display
const RISK_LABEL: Record<string, string> = {
  none: 'NONE', watch: 'WATCH', elevated: 'ELEVATED', high: 'HIGH'
}

interface SignalCardProps {
  signal: Signal
  conflict: Conflict
}

export default function SignalCard({ signal, conflict }: SignalCardProps) {
  const [exposures, setExposures] = useState<ExposureLink[]>([])
  const [analogueData, setAnalogueData] = useState<AnalogueData | null>(null)
  const [provenanceOpen, setProvenanceOpen] = useState(false)
  const [loadingExposures, setLoadingExposures] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/conflict/${conflict.id}/exposures`).then(r => r.json()),
      fetch(`/api/conflict/${conflict.id}/analogues?n=10`).then(r => r.json()),
    ]).then(([exp, ana]) => {
      setExposures(exp.exposures ?? [])
      setAnalogueData(ana)
    }).finally(() => setLoadingExposures(false))
  }, [conflict.id])

  const p = signal.pEscalation
  const pPct = p !== null ? Math.round(p * 100) : null

  return (
    <article className="border rounded-sm overflow-hidden" style={{ borderColor: 'var(--border-2)', background: 'var(--surface)' }}>
      {/* ── Header row ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* Severity bar */}
        <div
          className="w-1 self-stretch rounded-full flex-shrink-0"
          style={{ background: sevColor(conflict.threatLevel) }}
          title={`Threat level ${conflict.threatLevel}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-white leading-tight">{conflict.name}</h2>
            <span className="text-xs tabnum text-gray-400">{conflict.region}</span>
          </div>
          {conflict.currentSituationLine && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {conflict.currentSituationLine}
            </p>
          )}
        </div>
        {/* Risk badge */}
        <span
          className="text-xs font-mono font-bold px-2 py-0.5 rounded-sm flex-shrink-0 border"
          style={{
            color: forecastColor(p),
            borderColor: forecastColor(p),
          }}
        >
          {RISK_LABEL[signal.escalationRisk] ?? signal.escalationRisk.toUpperCase()}
        </span>
      </div>

      {/* ── Probability row ─────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center gap-6 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* pEscalation */}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            P(escalation / {signal.horizonDays ?? 14}d)
          </span>
          {pPct !== null ? (
            <span className="tabnum text-2xl font-bold leading-tight" style={{ color: forecastColor(p) }}>
              {pPct}%
            </span>
          ) : (
            <span className="tabnum text-2xl font-bold leading-tight text-gray-600">—</span>
          )}
          {signal.ciLow !== null && signal.ciHigh !== null && (
            <span className="tabnum text-[10px]" style={{ color: 'var(--text-muted)' }}>
              CI {Math.round(signal.ciLow * 100)}–{Math.round(signal.ciHigh * 100)}%
            </span>
          )}
        </div>

        {/* Probability bar */}
        {pPct !== null && (
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-2)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pPct}%`, background: forecastColor(p) }}
            />
          </div>
        )}

        {/* Model version */}
        <span className="text-[10px] tabnum" style={{ color: 'var(--text-dim)' }}>
          {signal.modelVersion}
        </span>
      </div>

      {/* ── Trajectory + drivers ────────────────────────────────── */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Trajectory</span>
          <span className="text-xs font-mono text-white">{signal.trajectory}</span>
        </div>
        {signal.drivers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {signal.drivers.map((d, i) => (
              <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm border" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-2)' }}>
                {d}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Exposure ladder ─────────────────────────────────────── */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          Exposed instruments
        </div>
        {loadingExposures ? (
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Loading…</div>
        ) : exposures.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>No instrument exposure mapped</div>
        ) : (
          <div className="space-y-1">
            {exposures.slice(0, 5).map((exp, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* Weight bar */}
                <div className="w-16 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--border-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${exp.weight * 100}%`, background: 'var(--accent-amber)' }} />
                </div>
                <span className="tabnum text-xs font-mono text-white w-8 flex-shrink-0">{(exp.weight * 100).toFixed(0)}%</span>
                <span className="text-xs" style={{ color: 'var(--text)' }}>{exp.instrumentLabel}</span>
                <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>{exp.zoneLabel}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Analogue base rate ──────────────────────────────────── */}
      {analogueData && analogueData.totalCandidates > 0 && (
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Historical analogues
          </div>
          <div className="flex items-baseline gap-4">
            <div>
              <span className="tabnum text-lg font-bold" style={{ color: 'var(--text)' }}>
                {Math.round(analogueData.baseRate * 100)}%
              </span>
              <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>base rate escalated</span>
            </div>
            <div>
              <span className="tabnum text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                ±{Math.round(analogueData.dispersion * 100)}% dispersion
              </span>
            </div>
            <div>
              <span className="tabnum text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                n={Math.min(analogueData.analogues.length, 10)} of {analogueData.totalCandidates}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Provenance expander ─────────────────────────────────── */}
      <div className="px-4 py-2">
        <button
          onClick={() => setProvenanceOpen(o => !o)}
          className="text-[10px] uppercase tracking-wider flex items-center gap-1 hover:text-white transition-colors"
          style={{ color: 'var(--text-dim)' }}
        >
          <span>{provenanceOpen ? '▾' : '▸'}</span> Provenance
        </button>
        {provenanceOpen && (
          <div className="mt-2 space-y-1.5 text-[10px] tabnum" style={{ color: 'var(--text-muted)' }}>
            <div className="flex gap-2">
              <span className="w-24 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>Signal ID</span>
              <span className="font-mono">{signal.id}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>Model</span>
              <span className="font-mono">{signal.modelVersion}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>Computed</span>
              <span className="font-mono">{new Date(signal.computedAt).toISOString()}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>Source events</span>
              <span className="font-mono">{signal.usedEventIds.length} events</span>
            </div>
            {signal.rationale && (
              <div className="mt-1 pt-1 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                {signal.rationale}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
