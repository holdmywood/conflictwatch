'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import TerminalShell from '../components/TerminalShell'
import Panel from '../components/Panel'
import SevMark from '../components/SevMark'
import { fmtPct, fmtUTC, fmtAgo, fmtInt, forecastColor } from '../lib/tokens'

interface Dashboard {
  present: {
    activeConflicts: number
    eventsThisWeek: number
    lastIngestedAt: string | null
    sourcesOk: number
    sourcesFailed: number
  }
  forecast: {
    watchList: Array<{
      conflictId: string
      name: string
      threatLevel: number
      escalationRisk: string
      pEscalation: number | null
      ciLow: number | null
      ciHigh: number | null
      horizonDays: number | null
    }>
  }
  calibration: { resolved: number; pending: number }
}

interface Latency { medianLeadTimeMinutes: number | null; sampleSize: number }

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="label mb-1">{label}</div>
      <div className="tabnum text-[22px] leading-none" style={{ color: 'var(--text)' }}>{value}</div>
      {sub && <div className="tabnum text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [latency, setLatency] = useState<Latency | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard').then(r => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true))
    fetch('/api/latency').then(r => (r.ok ? r.json() : Promise.reject())).then(setLatency).catch(() => {})
  }, [])

  return (
    <TerminalShell>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1.5">
        {error && (
          <Panel title="Dashboard">
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Stats service unreachable.</p>
          </Panel>
        )}

        {/* ── Present state ──────────────────────────────────────── */}
        <Panel title="Present state" flush>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0" style={{ borderColor: 'var(--border)' }}>
            <Stat label="Active conflicts" value={data ? fmtInt(data.present.activeConflicts) : '—'} />
            <Stat label="Events · 7d" value={data ? fmtInt(data.present.eventsThisWeek) : '—'} />
            <Stat
              label="Ingest"
              value={data?.present.lastIngestedAt ? `${fmtAgo(data.present.lastIngestedAt)} ago` : '—'}
              sub={data?.present.lastIngestedAt ? fmtUTC(data.present.lastIngestedAt) : undefined}
            />
            <Stat
              label="Lead time"
              value={latency?.medianLeadTimeMinutes != null ? `${Math.round(latency.medianLeadTimeMinutes)}m` : '—'}
              sub={latency ? `median · n=${latency.sampleSize}` : undefined}
            />
          </div>
        </Panel>

        {/* ── Escalation watch (forecast channel — kept separate) ── */}
        <Panel
          title="Escalation watch"
          meta={<span className="label">forecast</span>}
          flush
        >
          {!data ? (
            <p className="tabnum text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Loading…</p>
          ) : data.forecast.watchList.length === 0 ? (
            <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>
              No active escalation signals. Signals compute when a conflict shows sustained corroborated activity.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="label text-left px-2.5 py-1">Conflict</th>
                  <th className="label text-left px-2.5 py-1">Threat</th>
                  <th className="label text-right px-2.5 py-1">P(escalation)</th>
                  <th className="label text-right px-2.5 py-1">CI</th>
                  <th className="label text-right px-2.5 py-1">Horizon</th>
                </tr>
              </thead>
              <tbody>
                {data.forecast.watchList.map(w => (
                  <tr key={w.conflictId} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2.5 py-1.5 text-[11px]" style={{ color: 'var(--text)' }}>{w.name}</td>
                    <td className="px-2.5 py-1.5"><SevMark level={w.threatLevel} /></td>
                    <td className="px-2.5 py-1.5 text-right tabnum text-[12px]" style={{ color: forecastColor(w.pEscalation) }}>
                      {w.pEscalation !== null ? fmtPct(w.pEscalation) : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
                      {w.ciLow !== null && w.ciHigh !== null ? `${fmtPct(w.ciLow)}–${fmtPct(w.ciHigh)}` : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
                      {w.horizonDays ?? 14}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* ── Coverage / track record ────────────────────────────── */}
        <Panel title="Coverage" flush>
          <div className="grid grid-cols-2 md:grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
            <Stat
              label="Sources last cycle"
              value={data ? `${data.present.sourcesOk}/${data.present.sourcesOk + data.present.sourcesFailed}` : '—'}
              sub="ok / total"
            />
            <Stat label="Resolved signals" value={data ? fmtInt(data.calibration.resolved) : '—'} sub="for calibration" />
            <Stat label="Pending resolution" value={data ? fmtInt(data.calibration.pending) : '—'} />
          </div>
          <div className="px-2.5 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <Link href="/methodology" className="text-[11px] hover:underline" style={{ color: 'var(--text-2)' }}>
              Methodology & calibration →
            </Link>
            <Link href="/archive" className="text-[11px] hover:underline ml-4" style={{ color: 'var(--text-2)' }}>
              Intel archive →
            </Link>
          </div>
        </Panel>
      </div>
    </TerminalShell>
  )
}
