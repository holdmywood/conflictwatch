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
import { passesDisplayGate, AIRCRAFT_ROLES, type AircraftRole } from './lib/aircraft-classify'
import { BASE_TYPES, MILITARY_SITES, type BaseType, type MilitarySite } from './lib/military-sites'
import type { Signal } from './components/SignalCard'
import type { ConflictPoint, EventBlip, HazardPoint, Outbreak, MilitaryAircraft } from './components/Globe'

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

interface BulkBase {
  id: string
  name: string
  country: string
  region: string
  lat: number
  lng: number
  baseType: BaseType
}

// Adapt a public-record airbase row to the MilitarySite model with honest
// defaults: name-evidence match, operational status unknown, nothing invented.
function bulkBaseToSite(b: BulkBase, generatedAt: string): MilitarySite {
  return {
    ...b,
    branch:
      b.baseType === 'naval-air-station' ? 'naval'
      : b.baseType === 'army-aviation' ? 'army'
      : b.baseType === 'joint-base' ? 'joint'
      : 'air',
    operator: 'Unverified — public record',
    status: 'unknown',
    strategicImportance: 'medium',
    publicDescription:
      'Military-named airfield from public aviation records (OurAirports). Matched by name evidence only; operational status unverified.',
    knownPublicRoles: [],
    sources: ['OurAirports (public domain)'],
    confidence: 'medium',
    lastUpdated: generatedAt,
    reviewStatus: 'unreviewed',
    tier: 'public-record',
  }
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
  const [hazards, setHazards] = useState<HazardPoint[]>([])
  const [hazardsState, setHazardsState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [outbreaks, setOutbreaks] = useState<Outbreak[]>([])
  const [outbreaksState, setOutbreaksState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [aircraft, setAircraft] = useState<MilitaryAircraft[]>([])
  const [aircraftState, setAircraftState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [bulkAirbases, setBulkAirbases] = useState<MilitarySite[]>([])
  const bulkAirbasesRequested = useRef(false)
  const [selection, setSelection] = useState<Selection | null>(null)

  // Tracking-lens filters (military aircraft + bases)
  const [roleFilter, setRoleFilter] = useState<'' | AircraftRole>('')
  const [confidenceFilter, setConfidenceFilter] = useState<'' | 'high'>('')
  const [operatorFilter, setOperatorFilter] = useState('')
  const [callsignFilter, setCallsignFilter] = useState('')
  const [baseTypeFilter, setBaseTypeFilter] = useState<'' | BaseType>('')

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

  // Lens data loads lazily — the disasters feed is only fetched when the
  // lens is first activated.
  useEffect(() => {
    if (lensId !== 'disasters' || hazardsState !== 'idle') return
    setHazardsState('loading')
    fetch('/api/disasters')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { hazards: HazardPoint[] }) => { setHazards(d.hazards); setHazardsState('ok') })
      .catch(() => setHazardsState('error'))
  }, [lensId, hazardsState])

  useEffect(() => {
    if (lensId !== 'contamination' || outbreaksState !== 'idle') return
    setOutbreaksState('loading')
    fetch('/api/contamination')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { outbreaks: Outbreak[] }) => { setOutbreaks(d.outbreaks); setOutbreaksState('ok') })
      .catch(() => setOutbreaksState('error'))
  }, [lensId, outbreaksState])

  useEffect(() => {
    if (lensId !== 'tracking' || aircraftState !== 'idle') return
    setAircraftState('loading')
    fetch('/api/tracking/aircraft')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { aircraft: MilitaryAircraft[] }) => {
        // Frontend guard: re-apply the military/state display gate so
        // commercial/unknown aircraft never render even if the API failed
        setAircraft((d.aircraft ?? []).filter(passesDisplayGate))
        setAircraftState('ok')
      })
      .catch(() => setAircraftState('error'))
  }, [lensId, aircraftState])

  // Bulk public-record airbases (static JSON, ~200 KB) — fetched once when
  // the tracking lens first activates
  useEffect(() => {
    if (lensId !== 'tracking' || bulkAirbasesRequested.current) return
    bulkAirbasesRequested.current = true
    fetch('/data/military-airbases.json')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { generatedAt: string; bases: BulkBase[] }) =>
        setBulkAirbases(d.bases.map(b => bulkBaseToSite(b, d.generatedAt)))
      )
      .catch(() => { bulkAirbasesRequested.current = false })
  }, [lensId])

  // User-facing tracking filters on top of the guard
  const filteredAircraft = useMemo(() => {
    let list = aircraft
    if (roleFilter) list = list.filter(a => (a.role ?? 'unknown-military') === roleFilter)
    if (confidenceFilter) list = list.filter(a => a.confidence === confidenceFilter)
    if (operatorFilter) {
      const q = operatorFilter.toLowerCase()
      list = list.filter(a =>
        (a.operator ?? '').toLowerCase().includes(q) || a.country.toLowerCase().includes(q))
    }
    if (callsignFilter) {
      const q = callsignFilter.toLowerCase()
      list = list.filter(a => a.callsign.toLowerCase().includes(q) || a.icao24.toLowerCase().includes(q))
    }
    return list
  }, [aircraft, roleFilter, confidenceFilter, operatorFilter, callsignFilter])

  const siteFilter = useMemo(() => {
    if (!baseTypeFilter && !operatorFilter) return undefined
    const q = operatorFilter.toLowerCase()
    return (s: MilitarySite) =>
      (!baseTypeFilter || s.baseType === baseTypeFilter) &&
      (!q || s.operator.toLowerCase().includes(q) || s.country.toLowerCase().includes(q))
  }, [baseTypeFilter, operatorFilter])

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
        lens.status !== 'live' ? (
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>no data source</span>
        ) : lensId === 'disasters' ? (
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
            {hazardsState === 'loading' ? 'loading hazards…'
              : hazardsState === 'error' ? 'feed unreachable'
              : `${hazards.length} hazards · USGS + GDACS`}
          </span>
        ) : lensId === 'contamination' ? (
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
            {outbreaksState === 'loading' ? 'loading outbreaks…'
              : outbreaksState === 'error' ? 'feed unreachable'
              : `${outbreaks.length} outbreaks · WHO DON`}
          </span>
        ) : lensId === 'tracking' ? (
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
            {aircraftState === 'loading' ? 'loading military ADS-B…'
              : aircraftState === 'error' ? 'OpenSky unreachable'
              : `${filteredAircraft.length} military/state aircraft · ${MILITARY_SITES.length + bulkAirbases.length} bases`}
          </span>
        ) : (
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
            {conflicts.length} conflicts · {blips.length} events
          </span>
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
        {lensId === 'tracking' && (
          <div
            className="flex items-center gap-1.5 h-8 px-2 border-b shrink-0 overflow-x-auto"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as '' | AircraftRole)}
              className="field" style={{ fontSize: 10, padding: '2px 4px' }}
              aria-label="Aircraft role"
            >
              <option value="">All roles</option>
              {AIRCRAFT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={confidenceFilter}
              onChange={e => setConfidenceFilter(e.target.value as '' | 'high')}
              className="field" style={{ fontSize: 10, padding: '2px 4px' }}
              aria-label="Classification confidence"
            >
              <option value="">High + medium confidence</option>
              <option value="high">High confidence only</option>
            </select>
            <input
              value={operatorFilter}
              onChange={e => setOperatorFilter(e.target.value)}
              placeholder="Operator/country…"
              className="field" style={{ width: 120, fontSize: 10, padding: '2px 4px' }}
              aria-label="Filter by operator or country"
            />
            <input
              value={callsignFilter}
              onChange={e => setCallsignFilter(e.target.value)}
              placeholder="Callsign/hex…"
              className="field" style={{ width: 100, fontSize: 10, padding: '2px 4px' }}
              aria-label="Filter by callsign or ICAO hex"
            />
            <select
              value={baseTypeFilter}
              onChange={e => setBaseTypeFilter(e.target.value as '' | BaseType)}
              className="field" style={{ fontSize: 10, padding: '2px 4px' }}
              aria-label="Base type"
            >
              <option value="">All base types</option>
              {BASE_TYPES.map(t => <option key={t} value={t}>{t.replaceAll('-', ' ')}</option>)}
            </select>
          </div>
        )}
        <div ref={containerRef} className="relative flex-1 min-h-0">
          <Globe
            lens={lensId}
            toggles={toggles}
            conflicts={conflicts}
            events={blips}
            hazards={hazards}
            outbreaks={outbreaks}
            aircraft={filteredAircraft}
            airbases={bulkAirbases}
            siteFilter={siteFilter}
            selectedHotspotZone={selection?.type === 'hotspot' ? selection.hotspot.zone : null}
            conflictByNeName={conflictByNeName}
            selectedCountryName={selection?.type === 'country' ? selection.name : null}
            onSelectCountry={c => setSelection({ type: 'country', name: c.name, conflict: c.conflict })}
            onSelectEvent={e => setSelection({ type: 'event', event: e })}
            onSelectHotspot={h => setSelection({ type: 'hotspot', hotspot: h })}
            onSelectHazard={h => setSelection({ type: 'hazard', hazard: h })}
            onSelectOutbreak={o => setSelection({ type: 'outbreak', outbreak: o })}
            onSelectAircraft={a => setSelection({ type: 'aircraft', aircraft: a })}
            onSelectMilitarySite={s => setSelection({ type: 'militarySite', site: s })}
            containerWidth={dims.width}
            containerHeight={dims.height}
          />
          <Legend lens={lens} />
          {lensId === 'tracking' && aircraftState === 'ok' && toggles['aircraft'] !== false && filteredAircraft.length === 0 && (
            <div className="absolute inset-x-0 top-0 z-10 flex justify-center pointer-events-none" role="status">
              <div
                className="mt-3 px-3 py-2 border rounded-[2px] max-w-md text-center"
                style={{ background: 'rgba(22, 21, 17, 0.94)', borderColor: 'var(--border-strong)' }}
              >
                <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                  No publicly classified military/state aircraft currently visible for this area.
                </p>
              </div>
            </div>
          )}
          {lensId === 'tracking' && (toggles['vessels'] || toggles['missile-events']) && (
            <div className="absolute bottom-2 right-2 z-10 max-w-xs px-2 py-1.5 border rounded-[2px]"
              style={{ background: 'rgba(22, 21, 17, 0.92)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                {toggles['vessels'] && 'Vessels: global AIS needs a feed key; per-hotspot AIS is on the Conflict lens. '}
                {toggles['missile-events'] && 'Missile events are report-derived from corroborated OSINT, not a live sensor; none in the current window.'}
              </p>
            </div>
          )}
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
