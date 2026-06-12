'use client'

import { useMemo, useRef } from 'react'
import { fmtUTC, sevColor } from '../../lib/tokens'

export interface TimelineMarker {
  id: string
  kind: 'event' | 'signal'
  label: string
  severity: number | null
  at: string
}

export type TimelinePreset = '24h' | '7d' | '30d' | '90d' | '1y' | 'custom'

export const PRESET_MS: Record<Exclude<TimelinePreset, 'custom'>, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
  '90d': 90 * 24 * 3600_000,
  '1y': 365 * 24 * 3600_000,
}

interface TimelineBarProps {
  active: boolean
  preset: TimelinePreset
  from: number
  to: number
  asOf: number
  playing: boolean
  speed: 1 | 2 | 4
  markers: TimelineMarker[]
  loading: boolean
  onActivate: () => void
  onClose: () => void
  onPreset: (p: TimelinePreset) => void
  onCustomRange: (fromIso: string, toIso: string) => void
  onScrub: (asOf: number) => void
  onPlayPause: () => void
  onSpeed: (s: 1 | 2 | 4) => void
  onStep: (dir: -1 | 1) => void
}

function Btn({ label, onClick, title, active }: { label: string; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="px-1.5 py-0.5 text-[10px] border rounded-[2px] transition-colors"
      style={{
        fontFamily: 'var(--font-mono)',
        color: active ? 'var(--text)' : 'var(--text-2)',
        borderColor: active ? 'var(--border-strong)' : 'var(--border)',
        background: active ? 'var(--surface-2)' : 'transparent',
      }}
    >
      {label}
    </button>
  )
}

/**
 * Timeline replay control — a slim strip docked under the globe. Collapsed
 * it is a single quiet button; expanded it carries presets, transport
 * controls, the scrubber, and significant-event ticks. Replayed state is
 * archived platform data recomputed point-in-time, and the strip says so.
 */
export default function TimelineBar(p: TimelineBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const markerTicks = useMemo(
    () =>
      p.markers
        .map(m => ({ ...m, t: new Date(m.at).getTime() }))
        .filter(m => m.t >= p.from && m.t <= p.to)
        .map(m => ({ ...m, pct: ((m.t - p.from) / (p.to - p.from)) * 100 })),
    [p.markers, p.from, p.to]
  )

  if (!p.active) {
    return (
      <div
        className="flex items-center h-7 px-2 border-t shrink-0"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={p.onActivate}
          className="label hover:underline"
          style={{ color: 'var(--text-2)' }}
          title="Replay historical platform state"
        >
          ▸ Timeline replay
        </button>
        <span className="tabnum text-[10px] ml-auto" style={{ color: 'var(--text-3)' }}>live</span>
      </div>
    )
  }

  const fmtPos = (ms: number) => fmtUTC(new Date(ms))

  return (
    <div
      className="border-t shrink-0 select-none"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      role="region"
      aria-label="Timeline replay"
    >
      {/* Controls row */}
      <div className="flex items-center gap-1.5 h-8 px-2 overflow-x-auto">
        <span className="label shrink-0" style={{ color: 'var(--stale)' }}>replay</span>
        <select
          value={p.preset}
          onChange={e => p.onPreset(e.target.value as TimelinePreset)}
          className="field"
          style={{ fontSize: 10, padding: '1px 4px' }}
          aria-label="Replay range"
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last year</option>
          <option value="custom">Custom range</option>
        </select>
        {p.preset === 'custom' && (
          <>
            <input
              type="datetime-local"
              className="field"
              style={{ fontSize: 10, padding: '1px 4px' }}
              aria-label="Range start"
              defaultValue={new Date(p.from).toISOString().slice(0, 16)}
              onChange={e => e.target.value && p.onCustomRange(e.target.value, new Date(p.to).toISOString())}
            />
            <input
              type="datetime-local"
              className="field"
              style={{ fontSize: 10, padding: '1px 4px' }}
              aria-label="Range end"
              defaultValue={new Date(p.to).toISOString().slice(0, 16)}
              onChange={e => e.target.value && p.onCustomRange(new Date(p.from).toISOString(), e.target.value)}
            />
          </>
        )}
        <Btn label="⏮" title="Step back" onClick={() => p.onStep(-1)} />
        <Btn label={p.playing ? '⏸' : '▶'} title={p.playing ? 'Pause' : 'Play'} onClick={p.onPlayPause} active={p.playing} />
        <Btn label="⏭" title="Step forward" onClick={() => p.onStep(1)} />
        {( [1, 2, 4] as const).map(s => (
          <Btn key={s} label={`${s}×`} title={`Playback speed ${s}×`} onClick={() => p.onSpeed(s)} active={p.speed === s} />
        ))}
        <span className="tabnum text-[11px] ml-1 shrink-0" style={{ color: 'var(--text)' }}>
          {fmtPos(p.asOf)}
        </span>
        {p.loading && <span className="tabnum text-[10px] shrink-0" style={{ color: 'var(--text-3)' }}>loading…</span>}
        <button
          onClick={p.onClose}
          className="label ml-auto hover:underline shrink-0"
          style={{ color: 'var(--text-2)' }}
          title="Exit replay, return to live"
        >
          return to live ✕
        </button>
      </div>

      {/* Scrubber + significant-event ticks */}
      <div className="relative h-6 mx-2 mb-1" ref={trackRef}>
        <input
          type="range"
          min={p.from}
          max={p.to}
          step={(p.to - p.from) / 480}
          value={p.asOf}
          onChange={e => p.onScrub(Number(e.target.value))}
          aria-label="Timeline position"
          className="absolute inset-x-0 top-1 w-full h-1 appearance-none cursor-pointer"
          style={{ background: 'var(--border)', accentColor: 'var(--accent)' }}
        />
        {markerTicks.map(m => (
          <button
            key={m.id}
            title={`${fmtUTC(m.at)} — ${m.label}`}
            aria-label={`Jump to: ${m.label}`}
            onClick={() => p.onScrub(m.t)}
            className="absolute top-3.5 w-[5px] h-[5px] -translate-x-1/2"
            style={{
              left: `${m.pct}%`,
              background: m.kind === 'event' ? sevColor(m.severity ?? 4) : 'transparent',
              border: m.kind === 'signal' ? '1px solid var(--fc-high)' : 'none',
              borderRadius: m.kind === 'signal' ? '50%' : 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
