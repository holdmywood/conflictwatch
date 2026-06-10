'use client'

import { forecastColor, fmtPct } from '../lib/tokens'
import SevMark from './SevMark'

export interface WatchlistEntry {
  id: string
  name: string
  region: string
  threatLevel: number
  pEscalation: number | null
}

interface WatchlistProps {
  entries: WatchlistEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  error?: boolean
  /** Hide the internal header (when the parent panel already provides one). */
  hideHeader?: boolean
}

/**
 * Ranked conflict watchlist: severity mark, name, P(escalation).
 * Severity (warm, present state) and forecast (cool) sit side by side.
 */
export default function Watchlist({ entries, selectedId, onSelect, error, hideHeader }: WatchlistProps) {
  return (
    <div className="py-1.5">
      {!hideHeader && (
        <div className="flex items-baseline justify-between px-2.5 py-1">
          <span className="label">Watchlist</span>
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{entries.length}</span>
        </div>
      )}
      {error ? (
        <p className="text-[11px] px-2.5 py-1.5" style={{ color: 'var(--text-3)' }}>
          Conflict service unreachable. Reload to retry.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-[11px] px-2.5 py-1.5" style={{ color: 'var(--text-3)' }}>
          No active conflicts on file. The worker populates this list after its first ingestion cycle.
        </p>
      ) : (
        <ul>
          {entries.map(c => {
            const selected = c.id === selectedId
            return (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  aria-pressed={selected}
                  className="w-full flex items-center gap-2 px-2.5 py-[7px] text-left transition-colors"
                  style={{
                    background: selected ? 'var(--surface-2)' : undefined,
                    boxShadow: selected ? 'inset 2px 0 0 var(--accent)' : undefined,
                  }}
                >
                  <SevMark level={c.threatLevel} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] leading-tight truncate" style={{ color: 'var(--text)' }}>
                      {c.name}
                    </span>
                    <span className="block text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
                      {c.region}
                    </span>
                  </span>
                  <span
                    className="tabnum text-[11px] shrink-0"
                    style={{ color: c.pEscalation !== null ? forecastColor(c.pEscalation) : 'var(--text-3)' }}
                    title={c.pEscalation !== null ? 'P(escalation), latest signal' : 'No signal yet'}
                  >
                    {c.pEscalation !== null ? fmtPct(c.pEscalation) : '—'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
