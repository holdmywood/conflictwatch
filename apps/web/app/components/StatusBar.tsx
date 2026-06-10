'use client'

import { useEffect, useState } from 'react'
import { fmtAgo } from '../lib/tokens'

const POLL_INTERVAL_MS = 15_000
const STALE_THRESHOLD_MS = 10 * 60 * 1000

interface Heartbeat {
  lastIngestedAt: string | null
  sourcesOk: number
  sourcesFailed: number
}

interface Latency {
  medianLeadTimeMinutes: number | null
  sampleSize: number
}

interface Calibration {
  meanBrierScore: number | null
  totalResolved: number
  modelVersion: string
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 px-3 border-r whitespace-nowrap" style={{ borderColor: 'var(--border)' }}>
      <span className="label">{label}</span>
      <span className="tabnum text-[11px]" style={{ color: 'var(--text-2)' }}>{children}</span>
    </div>
  )
}

export default function StatusBar() {
  const [hb, setHb] = useState<Heartbeat | null>(null)
  const [hbFailed, setHbFailed] = useState(false)
  const [latency, setLatency] = useState<Latency | null>(null)
  const [cal, setCal] = useState<Calibration | null>(null)
  const [clock, setClock] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    const poll = () =>
      fetch('/api/heartbeat')
        .then(r => r.json())
        .then(d => { setHb(d); setHbFailed(false) })
        .catch(() => setHbFailed(true))
    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetch('/api/latency').then(r => r.json()).then(setLatency).catch(() => {})
    fetch('/api/methodology').then(r => r.json()).then(setCal).catch(() => {})
  }, [])

  // UTC clock + relative-time refresh
  useEffect(() => {
    const tick = () => {
      setClock(`${new Date().toISOString().slice(11, 19)}Z`)
      setTick(t => t + 1)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const last = hb?.lastIngestedAt ? new Date(hb.lastIngestedAt) : null
  const stale = last ? Date.now() - last.getTime() > STALE_THRESHOLD_MS : false
  const feedState = hbFailed ? 'DOWN' : stale ? 'STALE' : last ? 'LIVE' : '—'
  const feedColor = hbFailed ? 'var(--down)' : stale ? 'var(--stale)' : last ? 'var(--ok)' : 'var(--text-3)'

  return (
    <footer
      className="flex items-center h-7 border-t shrink-0 overflow-x-auto select-none"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      aria-label="System status"
    >
      <div className="flex items-center gap-1.5 px-3 border-r" style={{ borderColor: 'var(--border)' }}>
        <span aria-hidden className="inline-block w-[7px] h-[7px]" style={{ background: feedColor }} />
        <span className="tabnum text-[11px] font-medium" style={{ color: feedColor }}>{feedState}</span>
        {last && (
          <span className="tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>
            ingest {fmtAgo(last)} ago
          </span>
        )}
      </div>
      {hb && (
        <Cell label="src">
          {hb.sourcesOk}/{hb.sourcesOk + hb.sourcesFailed} ok
        </Cell>
      )}
      {latency?.medianLeadTimeMinutes != null && (
        <Cell label="lead">
          {Math.round(latency.medianLeadTimeMinutes)}m median · n={latency.sampleSize}
        </Cell>
      )}
      {cal && (
        <Cell label="model">
          {cal.modelVersion}
          {cal.meanBrierScore !== null && ` · brier ${cal.meanBrierScore.toFixed(4)}`}
        </Cell>
      )}
      <div className="ml-auto px-3">
        <span className="tabnum text-[11px]" style={{ color: 'var(--text-2)' }}>{clock}</span>
      </div>
    </footer>
  )
}
