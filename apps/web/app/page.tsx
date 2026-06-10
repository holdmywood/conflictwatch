'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import TerminalShell from './components/TerminalShell'
import ConflictPanel from './components/ConflictPanel'
import Panel from './components/Panel'
import SignalCard, { type Signal } from './components/SignalCard'
import Watchlist, { type WatchlistEntry } from './components/Watchlist'
import EventTape from './components/EventTape'
import type { ConflictPoint } from './components/Globe'

const Globe = dynamic(() => import('./components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>
      Loading map…
    </div>
  ),
})

interface ConflictRow extends ConflictPoint {
  region: string
  currentSituationLine: string
}

export default function OverviewPage() {
  const [conflicts, setConflicts] = useState<ConflictRow[]>([])
  const [conflictsError, setConflictsError] = useState(false)
  const [signals, setSignals] = useState<Map<string, Signal>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 800, height: 600 })

  useEffect(() => {
    fetch('/api/conflicts')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: ConflictRow[]) => {
        setConflicts(data)
        // default selection: highest threat (API returns threat-desc order)
        setSelectedId(prev => prev ?? data[0]?.id ?? null)
      })
      .catch(() => setConflictsError(true))

    fetch('/api/signals')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { signals: Signal[] }) => {
        setSignals(new Map(d.signals.map(s => [s.targetId, s])))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setDims({ width: el.clientWidth, height: el.clientHeight })
    const obs = new ResizeObserver(([entry]) => {
      if (entry) setDims({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const watchlist: WatchlistEntry[] = useMemo(
    () =>
      conflicts.map(c => ({
        id: c.id,
        name: c.name,
        region: c.region,
        threatLevel: c.threatLevel,
        pEscalation: signals.get(c.id)?.pEscalation ?? null,
      })),
    [conflicts, signals]
  )

  const selected = conflicts.find(c => c.id === selectedId) ?? null
  const selectedSignal = selectedId ? signals.get(selectedId) ?? null : null

  const signalPanel = selected && selectedSignal ? (
    <SignalCard
      signal={selectedSignal}
      conflict={{
        id: selected.id,
        name: selected.name,
        region: selected.region,
        threatLevel: selected.threatLevel,
        currentSituationLine: selected.currentSituationLine,
      }}
    />
  ) : (
    <Panel title="Signal">
      <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
        {selected
          ? 'No escalation signal for this conflict yet. Signals compute after each ingestion cycle.'
          : 'Select a conflict from the watchlist.'}
      </p>
    </Panel>
  )

  return (
    <TerminalShell
      sidebar={
        <Watchlist
          entries={watchlist}
          selectedId={selectedId}
          onSelect={setSelectedId}
          error={conflictsError}
        />
      }
    >
      {/* ── Desktop: theater map + tape | signal rail ─────────── */}
      <div className="hidden md:grid flex-1 min-h-0 gap-1.5 p-1.5 grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid grid-rows-[minmax(0,1fr)_232px] gap-1.5 min-h-0">
          <Panel
            title="Theater map"
            meta={<span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{conflicts.length} plotted</span>}
            flush
            className="overflow-hidden"
          >
            <div ref={containerRef} className="relative w-full h-full">
              <Globe
                conflicts={conflicts}
                onSelect={c => setSelectedId(c.id)}
                containerWidth={dims.width}
                containerHeight={dims.height}
              />
            </div>
          </Panel>
          <Panel title="Event tape" flush className="overflow-hidden">
            <div className="h-full overflow-y-auto">
              <EventTape />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-1.5 min-h-0 overflow-y-auto">
          {signalPanel}
          <Panel title="Recent events" meta={selected && <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{selected.name}</span>} flush>
            <div className="max-h-[420px] overflow-y-auto">
              <ConflictPanel conflictId={selectedId} />
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Mobile: focused watchlist + signal view ───────────── */}
      <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1.5">
        <Panel title="Watchlist" meta={<span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{watchlist.length}</span>} flush>
          <Watchlist
            entries={watchlist}
            selectedId={selectedId}
            onSelect={setSelectedId}
            error={conflictsError}
            hideHeader
          />
        </Panel>
        {signalPanel}
        <Panel title="Recent events" flush>
          <ConflictPanel conflictId={selectedId} />
        </Panel>
      </div>
    </TerminalShell>
  )
}
