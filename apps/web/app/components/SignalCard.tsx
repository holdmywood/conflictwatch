'use client'

import { useEffect, useId, useState } from 'react'
import { forecastColor, fmtPct, fmtUTC } from '../lib/tokens'
import SevMark from './SevMark'

export interface Signal {
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

export interface SignalConflict {
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

const RISK_LABEL: Record<string, string> = {
  none: 'NONE', watch: 'WATCH', elevated: 'ELEVATED', high: 'HIGH',
}

/**
 * Probability track: 0–100 scale carrying the point estimate, its CI band,
 * and (when available) the analogue base rate as a reference tick — forecast
 * and historical base rate read off the same axis.
 */
function ProbabilityTrack({
  p, ciLow, ciHigh, baseRate,
}: { p: number; ciLow: number | null; ciHigh: number | null; baseRate: number | null }) {
  const color = forecastColor(p)
  return (
    <div className="relative h-[18px]" role="img"
      aria-label={`Probability ${fmtPct(p)}${ciLow !== null && ciHigh !== null ? `, confidence interval ${fmtPct(ciLow)} to ${fmtPct(ciHigh)}` : ''}${baseRate !== null ? `, analogue base rate ${fmtPct(baseRate)}` : ''}`}>
      {/* axis */}
      <div className="absolute left-0 right-0 top-[8px] h-px" style={{ background: 'var(--border-strong)' }} />
      {/* quartile ticks */}
      {[0, 25, 50, 75, 100].map(t => (
        <div key={t} className="absolute top-[6px] w-px h-[5px]" style={{ left: `${t}%`, background: 'var(--border-strong)' }} />
      ))}
      {/* CI band */}
      {ciLow !== null && ciHigh !== null && (
        <div
          className="absolute top-[6px] h-[5px]"
          style={{ left: `${ciLow * 100}%`, width: `${(ciHigh - ciLow) * 100}%`, background: color, opacity: 0.35 }}
        />
      )}
      {/* point estimate */}
      <div className="absolute top-[3px] w-[2px] h-[11px] -translate-x-1/2" style={{ left: `${p * 100}%`, background: color }} />
      {/* analogue base rate reference tick */}
      {baseRate !== null && (
        <div
          className="absolute top-[12px] w-0 h-0 -translate-x-1/2"
          style={{
            left: `${baseRate * 100}%`,
            borderLeft: '3px solid transparent',
            borderRight: '3px solid transparent',
            borderBottom: '4px solid var(--text-2)',
          }}
          title={`Analogue base rate ${fmtPct(baseRate)}`}
        />
      )}
    </div>
  )
}

function Row({ label, children, asOf }: { label: string; children: React.ReactNode; asOf?: string }) {
  return (
    <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label">{label}</span>
        {asOf && <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{asOf}</span>}
      </div>
      {children}
    </div>
  )
}

export default function SignalCard({ signal, conflict }: { signal: Signal; conflict: SignalConflict }) {
  const [exposures, setExposures] = useState<ExposureLink[]>([])
  const [analogueData, setAnalogueData] = useState<AnalogueData | null>(null)
  const [analogueError, setAnalogueError] = useState(false)
  const [provenanceOpen, setProvenanceOpen] = useState(false)
  const [loadingExposures, setLoadingExposures] = useState(true)
  const provenanceId = useId()

  useEffect(() => {
    setLoadingExposures(true)
    setAnalogueError(false)
    const fetchExposures = fetch(`/api/conflict/${conflict.id}/exposures`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
    const fetchAnalogues = fetch(`/api/conflict/${conflict.id}/analogues?n=10`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)

    Promise.all([fetchExposures, fetchAnalogues])
      .then(([exp, ana]) => {
        setExposures(exp?.exposures ?? [])
        if (ana === null) {
          setAnalogueError(true)
          setAnalogueData(null)
        } else {
          setAnalogueData(ana)
        }
      })
      .catch(() => setAnalogueError(true))
      .finally(() => setLoadingExposures(false))
  }, [conflict.id])

  const p = signal.pEscalation
  const fcColor = forecastColor(p)
  const baseRate = analogueData && analogueData.totalCandidates > 0 ? analogueData.baseRate : null
  const escalatedCount = analogueData?.analogues.filter(a => a.escalatedToNational === true).length ?? 0
  const knownOutcomes = analogueData?.analogues.filter(a => a.escalatedToNational !== null).length ?? 0
  const maxWeight = exposures.length > 0 ? Math.max(...exposures.map(e => e.weight)) : 1

  return (
    <article className="panel" aria-label={`Escalation signal: ${conflict.name}`}>
      {/* ── Headline ─────────────────────────────────────────── */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SevMark level={conflict.threatLevel} />
              <span className="tabnum text-[10px] uppercase" style={{ color: 'var(--text-3)' }}>{conflict.region}</span>
            </div>
            <h3
              className="text-[15px] font-semibold leading-tight mt-1 truncate"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}
            >
              {conflict.name}
            </h3>
            {conflict.currentSituationLine && (
              <p className="text-[12px] mt-0.5 leading-snug" style={{ color: 'var(--text-2)' }}>
                {conflict.currentSituationLine}
              </p>
            )}
          </div>
          <span
            className="tabnum text-[10px] font-medium px-1.5 py-0.5 border shrink-0 mt-0.5"
            style={{ color: fcColor, borderColor: fcColor }}
            title="Forecast risk state"
          >
            {RISK_LABEL[signal.escalationRisk] ?? signal.escalationRisk.toUpperCase()}
          </span>
        </div>
      </div>

      {/* ── Forecast ─────────────────────────────────────────── */}
      <Row label={`P(escalation, ${signal.horizonDays ?? 14}d)`} asOf={fmtUTC(signal.computedAt)}>
        {p !== null ? (
          <>
            <div className="flex items-baseline gap-2.5">
              <span className="tabnum text-[26px] font-semibold leading-none" style={{ color: fcColor }}>
                {fmtPct(p)}
              </span>
              {signal.ciLow !== null && signal.ciHigh !== null && (
                <span className="tabnum text-[11px]" style={{ color: 'var(--text-2)' }}>
                  CI {fmtPct(signal.ciLow)}–{fmtPct(signal.ciHigh)}
                </span>
              )}
              {baseRate !== null && (
                <span className="tabnum text-[11px] ml-auto" style={{ color: 'var(--text-2)' }}>
                  ▲ base {fmtPct(baseRate)}
                </span>
              )}
            </div>
            <div className="mt-2">
              <ProbabilityTrack p={p} ciLow={signal.ciLow} ciHigh={signal.ciHigh} baseRate={baseRate} />
              <div className="flex justify-between tabnum text-[9px] mt-px" style={{ color: 'var(--text-3)' }}>
                <span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
            No probability computed for this cycle. Risk state: {RISK_LABEL[signal.escalationRisk] ?? signal.escalationRisk}.
          </p>
        )}
      </Row>

      {/* ── Trajectory + drivers ─────────────────────────────── */}
      <Row label="Trajectory">
        <div className="text-[12px]" style={{ color: 'var(--text)' }}>
          <span className="tabnum">{signal.trajectory}</span>
          {signal.drivers.length > 0 && (
            <span style={{ color: 'var(--text-2)' }}> — {signal.drivers.join(' · ')}</span>
          )}
        </div>
        {signal.actorsOfConcern.length > 0 && (
          <div className="text-[11px] mt-1" style={{ color: 'var(--text-2)' }}>
            <span className="label mr-1.5">Actors</span>
            {signal.actorsOfConcern.join(' · ')}
          </div>
        )}
      </Row>

      {/* ── Exposure ladder ──────────────────────────────────── */}
      <Row label="Exposure">
        {loadingExposures ? (
          <p className="tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
        ) : exposures.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>No instrument exposure mapped for this conflict.</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {exposures.slice(0, 5).map((exp, i) => (
                <tr key={i}>
                  <td className="tabnum text-[11px] text-right pr-2 py-[3px] w-10 align-middle" style={{ color: 'var(--text)' }}>
                    {fmtPct(exp.weight)}
                  </td>
                  <td className="w-[72px] pr-2 align-middle">
                    <div className="h-[4px]" style={{ background: 'var(--border)' }}>
                      <div className="h-full" style={{ width: `${(exp.weight / maxWeight) * 100}%`, background: 'var(--text-3)' }} />
                    </div>
                  </td>
                  <td className="text-[12px] py-[3px] align-middle" style={{ color: 'var(--text)' }}>{exp.instrumentLabel}</td>
                  <td className="text-[10px] text-right py-[3px] align-middle whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                    {exp.zoneLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Row>

      {/* ── Analogues ────────────────────────────────────────── */}
      <Row label="Historical analogues">
        {analogueError ? (
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            Analogue service unreachable. Forecast above is unaffected; retry on next refresh.
          </p>
        ) : analogueData && analogueData.totalCandidates > 0 ? (
          <div className="flex items-center gap-3">
            <span className="tabnum text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
              {fmtPct(analogueData.baseRate)}
            </span>
            {/* outcome strip: nearest analogues, ordered by distance; filled = escalated */}
            {knownOutcomes > 0 && (
              <span
                className="flex items-center gap-[3px]"
                role="img"
                aria-label={`${escalatedCount} of ${knownOutcomes} nearest analogues escalated`}
                title={`${escalatedCount} of ${knownOutcomes} nearest analogues escalated`}
              >
                {analogueData.analogues
                  .filter(a => a.escalatedToNational !== null)
                  .map((a, i) => (
                    <span
                      key={i}
                      className="inline-block w-[6px] h-[6px]"
                      style={a.escalatedToNational
                        ? { background: 'var(--text-2)' }
                        : { border: '1px solid var(--text-3)' }}
                    />
                  ))}
              </span>
            )}
            <span className="tabnum text-[10px] ml-auto whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
              ±{fmtPct(analogueData.dispersion)} · n={Math.min(analogueData.analogues.length, 10)}/{analogueData.totalCandidates}
            </span>
          </div>
        ) : (
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>No comparable historical episodes on file.</p>
        )}
      </Row>

      {/* ── Provenance ───────────────────────────────────────── */}
      <div className="border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setProvenanceOpen(o => !o)}
          aria-expanded={provenanceOpen}
          aria-controls={provenanceId}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left"
          style={{ color: 'var(--text-3)' }}
        >
          <span aria-hidden className="tabnum text-[9px]">{provenanceOpen ? '▾' : '▸'}</span>
          <span className="label" style={{ color: 'inherit' }}>Provenance</span>
          <span className="tabnum text-[10px] ml-auto">{signal.usedEventIds.length} events · {signal.modelVersion}</span>
        </button>
        {provenanceOpen && (
          <dl id={provenanceId} className="px-3 pb-2.5 grid grid-cols-[88px_1fr] gap-y-1 tabnum text-[11px]" style={{ color: 'var(--text-2)' }}>
            <dt style={{ color: 'var(--text-3)' }}>Signal ID</dt>
            <dd className="truncate">{signal.id}</dd>
            <dt style={{ color: 'var(--text-3)' }}>Model</dt>
            <dd>{signal.modelVersion}</dd>
            <dt style={{ color: 'var(--text-3)' }}>Computed</dt>
            <dd>{fmtUTC(signal.computedAt)}</dd>
            <dt style={{ color: 'var(--text-3)' }}>Inputs</dt>
            <dd>{signal.usedEventIds.length} events</dd>
            {signal.rationale && (
              <>
                <dt style={{ color: 'var(--text-3)' }}>Rationale</dt>
                <dd className="leading-snug" style={{ fontFamily: 'var(--font-body)' }}>{signal.rationale}</dd>
              </>
            )}
          </dl>
        )}
      </div>
    </article>
  )
}
