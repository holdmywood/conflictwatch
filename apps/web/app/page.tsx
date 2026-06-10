'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import TerminalShell from './components/TerminalShell'
import Panel from './components/Panel'
import Watchlist, { type WatchlistEntry } from './components/Watchlist'
import EventTape from './components/EventTape'
import DetailPanel, { type Selection } from './components/DetailPanel'
import LensSwitcher from './components/globe/LensSwitcher'
import Legend from './components/globe/Legend'
import { getLens, defaultToggles, type LensId } from './lib/lenses'
import { bindConflictsToCountries } from './lib/countries'
import type { Signal } from './components/SignalCard'
import type { ConflictPoint, EventBlip } from './components/Globe'

const Globe = dynamic(() => import('./components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>
      Loading globe…
    </div>
  ),
})

interface ConflictRow extends ConflictPoint {
  region: string
  currentSituationLine: string
}

interface FeedEvent {
  id: string
  title: string
  lat: number
  lng: number
  severity: number
  publishedAt: string
  sources: Array<{ id: string; name: string; url: string }>
}

export default function GlobePage() {
  const [lensId, setLensId] = useState<LensId>('conflict')
  const lens = getLens(lensId)
  const [togglesByLens, setTogglesByLens] = useState<Record<string, Record<string, boolean>>>({})
  const toggles = togglesByLens[lensId] ?? defaultToggles(lens)

  const [conflicts, setConflicts] = useState<ConflictRow[]>([])
  const [conflictsError, setConflictsError] = useState(false)
  const [signals, setSignals] = useState<Map<string, Signal>>(new Map())
  const [blips, setBlips] = useState<EventBlip[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 800, height: 600 })

  useEffect(() => {
    fetch('/api/conflicts')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: ConflictRow[]) => {
        setConflicts(data)
        // Default selection: highest-threat conflict (API is threat-desc)
        setSelection(prev =>
          prev ?? (data[0] ? { type: 'country', name: data[0].name, conflict: data[0] } : null)
        )
      })
      .catch(() => setConflictsError(true))

    fetch('/api/signals')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { signals: Signal[] }) => setSignals(new Map(d.signals.map(s => [s.targetId, s]))))
      .catch(() => {})

    fetch('/api/feed')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { events: FeedEvent[] }) =>
        setBlips(
          d.events
            .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng) && !(e.lat === 0 && e.lng === 0))
            .map(e => ({
              id: e.id, title: e.title, lat: e.lat, lng: e.lng,
              severity: e.severity, publishedAt: e.publishedAt, sources: e.sources,
            }))
        )
      )
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

  const situationLines = useMemo(
    () => new Map(conflicts.map(c => [c.id, c.currentSituationLine])),
    [conflicts]
  )

  // Deterministic country binding: point-in-polygon on conflict coordinates,
  // so polygon clicks, watchlist selection, and the selected-country fill all
  // agree on the same Natural Earth name.
  const { neNameByConflictId, conflictByNeName } = useMemo(
    () => bindConflictsToCountries(conflicts),
    [conflicts]
  )

  const selectConflictById = (id: string) => {
    const c = conflicts.find(x => x.id === id)
    if (c) setSelection({ type: 'country', name: neNameByConflictId.get(c.id) ?? c.name, conflict: c })
  }

  const globePane = (
    <Panel
      title={`Globe — ${lens.label}`}
      meta={
        lens.status === 'live' ? (
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
            {conflicts.length} conflicts · {blips.length} events
          </span>
        ) : (
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>no data source</span>
        )
      }
      flush
      className="overflow-hidden"
    >
      <div className="flex flex-col h-full min-h-0">
        <LensSwitcher
          active={lensId}
          toggles={toggles}
          onLensChange={id => setLensId(id)}
          onToggle={id =>
            setTogglesByLens(prev => ({
              ...prev,
              [lensId]: { ...(prev[lensId] ?? defaultToggles(lens)), [id]: !(toggles[id] !== false) },
            }))
          }
        />
        <div ref={containerRef} className="relative flex-1 min-h-0">
          <Globe
            lens={lensId}
            toggles={toggles}
            conflicts={conflicts}
            events={blips}
            conflictByNeName={conflictByNeName}
            selectedCountryName={selection?.type === 'country' ? selection.name : null}
            onSelectCountry={c => setSelection({ type: 'country', name: c.name, conflict: c.conflict })}
            onSelectEvent={e => setSelection({ type: 'event', event: e })}
            onSelectHotspot={h => setSelection({ type: 'hotspot', hotspot: h })}
            containerWidth={dims.width}
            containerHeight={dims.height}
          />
          <Legend lens={lens} />
          {lens.status === 'pending-source' && (
            <div
              className="absolute inset-x-0 top-0 z-10 flex justify-center pointer-events-none"
              role="status"
            >
              <div
                className="mt-3 px-3 py-2 border rounded-[2px] max-w-md text-center"
                style={{ background: 'rgba(22, 21, 17, 0.94)', borderColor: 'var(--border-strong)' }}
              >
                <div className="label mb-0.5">{lens.label} lens</div>
                <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                  No data source configured. Planned: {lens.plannedSources}.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )

  return (
    <TerminalShell
      sidebar={
        <Watchlist
          entries={watchlist}
          selectedId={selection?.type === 'country' ? selection.conflict?.id ?? null : null}
          onSelect={selectConflictById}
          error={conflictsError}
        />
      }
    >
      {/* ── Desktop: globe + tape | detail rail ──────────────────── */}
      <div className="hidden md:grid flex-1 min-h-0 gap-1.5 p-1.5 grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid grid-rows-[minmax(0,1fr)_200px] gap-1.5 min-h-0">
          {globePane}
          <Panel title="Event tape" flush className="overflow-hidden">
            <div className="h-full overflow-y-auto">
              <EventTape />
            </div>
          </Panel>
        </div>
        <div className="min-h-0 overflow-hidden">
          <DetailPanel selection={selection} signals={signals} situationLines={situationLines} blips={blips} />
        </div>
      </div>

      {/* ── Mobile: focused watchlist + detail sheet ─────────────── */}
      <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1.5">
        <Panel title="Watchlist" meta={<span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{watchlist.length}</span>} flush>
          <Watchlist
            entries={watchlist}
            selectedId={selection?.type === 'country' ? selection.conflict?.id ?? null : null}
            onSelect={selectConflictById}
            error={conflictsError}
            hideHeader
          />
        </Panel>
        <DetailPanel selection={selection} signals={signals} situationLines={situationLines} blips={blips} />
      </div>
    </TerminalShell>
  )
}
