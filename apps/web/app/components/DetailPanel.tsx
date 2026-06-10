'use client'

import { useEffect, useState } from 'react'
import Panel from './Panel'
import SevMark from './SevMark'
import ConflictPanel from './ConflictPanel'
import { fmtPct, fmtUTC, forecastColor } from '../lib/tokens'
import type { Signal } from './SignalCard'
import type { ConflictPoint, EventBlip } from './Globe'
import type { Hotspot } from '../lib/hotspots'

/**
 * The one contextual detail panel. Every globe click target opens here with
 * tabs scoped to the clicked object — a second competing panel is
 * unrepresentable by design.
 */
export type Selection =
  | { type: 'country'; name: string; conflict: ConflictPoint | null }
  | { type: 'event'; event: EventBlip }
  | { type: 'hotspot'; hotspot: Hotspot }

interface DetailPanelProps {
  selection: Selection | null
  /** Latest escalation signal per conflict id (forecast channel). */
  signals: Map<string, Signal>
  /** Situation line per conflict id, from the conflicts payload. */
  situationLines: Map<string, string>
  /** Recent event blips (for hotspot proximity lists). */
  blips?: EventBlip[]
}

const TABS: Record<Selection['type'], string[]> = {
  country: ['Assessment', 'Events', 'Exposure', 'Provenance'],
  event: ['Event', 'Sources'],
  hotspot: ['Zone', 'Exposure', 'Events', 'Maritime'],
}

function selectionKey(sel: Selection): string {
  if (sel.type === 'country') return `country:${sel.name}`
  if (sel.type === 'event') return `event:${sel.event.id}`
  return `hotspot:${sel.hotspot.zone}`
}

export default function DetailPanel({ selection, signals, situationLines, blips = [] }: DetailPanelProps) {
  const [tab, setTab] = useState(0)
  const [key, setKey] = useState('')

  // Reset to the first tab whenever the selected object changes
  const currentKey = selection ? selectionKey(selection) : ''
  if (currentKey !== key) {
    setKey(currentKey)
    setTab(0)
  }

  if (!selection) {
    return (
      <Panel title="Detail">
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          Select a country, event blip, or hotspot on the globe.
        </p>
      </Panel>
    )
  }

  const tabs = TABS[selection.type]
  const title =
    selection.type === 'country' ? selection.name
    : selection.type === 'event' ? 'Event'
    : selection.hotspot.label

  return (
    <Panel title={title} flush className="min-h-0">
      <div className="flex flex-col h-full min-h-0">
        <div role="tablist" aria-label={`${title} sections`} className="flex items-stretch h-7 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          {tabs.map((t, i) => (
            <button
              key={t}
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
              className="px-2.5 text-[10px] uppercase tracking-[0.06em] transition-colors"
              style={{
                fontFamily: 'var(--font-mono)',
                color: i === tab ? 'var(--text)' : 'var(--text-3)',
                boxShadow: i === tab ? 'inset 0 -2px 0 var(--accent)' : undefined,
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {selection.type === 'country' && (
            <CountryTabs
              tab={tabs[tab]}
              name={selection.name}
              conflict={selection.conflict}
              signal={selection.conflict ? signals.get(selection.conflict.id) ?? null : null}
              situationLine={selection.conflict ? situationLines.get(selection.conflict.id) ?? '' : ''}
            />
          )}
          {selection.type === 'event' && <EventTabs tab={tabs[tab]} event={selection.event} />}
          {selection.type === 'hotspot' && <HotspotTabs tab={tabs[tab]} hotspot={selection.hotspot} blips={blips} />}
        </div>
      </div>
    </Panel>
  )
}

/* ── Country ──────────────────────────────────────────────────────────────── */

function CountryTabs({
  tab, name, conflict, signal, situationLine,
}: {
  tab: string
  name: string
  conflict: ConflictPoint | null
  signal: Signal | null
  situationLine: string
}) {
  if (tab === 'Assessment') {
    return (
      <div className="p-2.5 space-y-2.5">
        <div className="flex items-center gap-2">
          <SevMark level={conflict?.threatLevel ?? 1} />
          <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>
            Threat level {conflict?.threatLevel ?? 1}/5
          </span>
        </div>
        <p className="text-[12px] leading-snug" style={{ color: 'var(--text)' }}>
          {conflict
            ? situationLine || 'Situation line pending next assessment cycle.'
            : 'Stable — no corroborated conflict events in the current window.'}
        </p>

        {/* Forecast is a separate, labeled channel — never blended with present state */}
        <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="label mb-1">Escalation forecast</div>
          {signal && signal.pEscalation !== null ? (
            <div className="space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="tabnum text-[16px] font-semibold" style={{ color: forecastColor(signal.pEscalation) }}>
                  {fmtPct(signal.pEscalation)}
                </span>
                <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
                  CI {signal.ciLow !== null ? fmtPct(signal.ciLow) : '—'}–{signal.ciHigh !== null ? fmtPct(signal.ciHigh) : '—'}
                  {' '}/ {signal.horizonDays ?? 14}d
                </span>
              </div>
              {signal.drivers.length > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                  Drivers: {signal.drivers.join('; ')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              No escalation signal. Signals compute when a conflict shows sustained corroborated activity.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (tab === 'Events') {
    if (!conflict) {
      return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>No corroborated events recorded for {name}.</p>
    }
    return <ConflictPanel conflictId={conflict.id} />
  }

  if (tab === 'Exposure') {
    if (!conflict) {
      return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>No instrument exposure mapped for {name}.</p>
    }
    return <ExposureList conflictId={conflict.id} />
  }

  // Provenance
  return (
    <div className="p-2.5 space-y-1">
      {signal ? (
        <dl className="space-y-1">
          <ProvRow k="Signal" v={signal.id} />
          <ProvRow k="Model" v={signal.modelVersion} />
          <ProvRow k="Computed" v={fmtUTC(signal.computedAt)} />
          <ProvRow k="Source events" v={`${signal.usedEventIds.length}`} />
        </dl>
      ) : (
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          No signal provenance — no escalation signal exists for {name}.
          {conflict ? ' Event-level sources are listed under Events.' : ''}
        </p>
      )}
    </div>
  )
}

function ProvRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="tabnum text-[10px] w-24 shrink-0" style={{ color: 'var(--text-3)' }}>{k}</dt>
      <dd className="tabnum text-[10px] break-all" style={{ color: 'var(--text-2)' }}>{v}</dd>
    </div>
  )
}

function ExposureList({ conflictId }: { conflictId: string }) {
  const [exposures, setExposures] = useState<Array<{ instrumentLabel: string; zoneLabel: string; weight: number }> | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setExposures(null)
    setError(false)
    fetch(`/api/conflict/${conflictId}/exposures`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setExposures(d.exposures ?? []))
      .catch(() => setError(true))
  }, [conflictId])

  if (error) return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Exposure service unreachable.</p>
  if (exposures === null) return <p className="tabnum text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Loading…</p>
  if (exposures.length === 0) return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>No instrument exposure mapped.</p>

  return (
    <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {exposures.map((e, i) => (
        <li key={i} className="flex items-baseline gap-2 px-2.5 py-1.5">
          <span className="tabnum text-[11px] w-9 text-right shrink-0" style={{ color: 'var(--text)' }}>{fmtPct(e.weight)}</span>
          <span className="text-[11px]" style={{ color: 'var(--text)' }}>{e.instrumentLabel}</span>
          <span className="tabnum text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-3)' }}>{e.zoneLabel}</span>
        </li>
      ))}
    </ol>
  )
}

/* ── Event blip ───────────────────────────────────────────────────────────── */

function EventTabs({ tab, event }: { tab: string; event: EventBlip }) {
  if (tab === 'Event') {
    return (
      <div className="p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <SevMark level={event.severity} />
          <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{fmtUTC(event.publishedAt)}</span>
        </div>
        <p className="text-[12px] leading-snug" style={{ color: 'var(--text)' }}>{event.title}</p>
        <p className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
          {event.lat.toFixed(2)}, {event.lng.toFixed(2)}
        </p>
      </div>
    )
  }
  if (event.sources.length === 0) {
    return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>No source links recorded.</p>
  }
  return (
    <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {event.sources.map(s => (
        <li key={s.id} className="px-2.5 py-1.5">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] hover:underline" style={{ color: 'var(--text-2)' }}>
            {s.name}
          </a>
        </li>
      ))}
    </ol>
  )
}

/* ── Hotspot ──────────────────────────────────────────────────────────────── */

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const HOTSPOT_EVENT_RADIUS_KM = 500

function HotspotTabs({ tab, hotspot, blips }: { tab: string; hotspot: Hotspot; blips: EventBlip[] }) {
  if (tab === 'Zone') {
    return (
      <div className="p-2.5 space-y-1.5">
        <dl className="space-y-1">
          <ProvRow k="Zone" v={hotspot.zone} />
          <ProvRow k="Type" v={hotspot.kind.replace('_', ' ')} />
          <ProvRow k="Position" v={`${hotspot.lat.toFixed(2)}, ${hotspot.lng.toFixed(2)}`} />
        </dl>
        {hotspot.reviewStatus === 'unreviewed' && (
          <p className="text-[10px] pt-1.5 border-t" style={{ color: 'var(--text-3)', borderColor: 'var(--border)' }}>
            Exposure linkages for this zone await editorial review.
          </p>
        )}
      </div>
    )
  }

  if (tab === 'Exposure') return <ZoneExposureList zone={hotspot.zone} />

  if (tab === 'Events') {
    const nearby = blips
      .filter(b => haversineKm(b.lat, b.lng, hotspot.lat, hotspot.lng) <= HOTSPOT_EVENT_RADIUS_KM)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    if (nearby.length === 0) {
      return (
        <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>
          No corroborated events within {HOTSPOT_EVENT_RADIUS_KM} km in the current feed window.
        </p>
      )
    }
    return (
      <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {nearby.map(e => (
          <li key={e.id} className="px-2.5 py-2">
            <div className="flex items-baseline gap-2">
              <SevMark level={e.severity} />
              <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{fmtUTC(e.publishedAt)}</span>
              <span className="tabnum text-[10px] ml-auto" style={{ color: 'var(--text-3)' }}>
                {Math.round(haversineKm(e.lat, e.lng, hotspot.lat, hotspot.lng))} km
              </span>
            </div>
            <p className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text)' }}>{e.title}</p>
          </li>
        ))}
      </ol>
    )
  }

  return <MaritimeTab zone={hotspot.zone} />
}

function ZoneExposureList({ zone }: { zone: string }) {
  const [data, setData] = useState<Array<{
    instrumentLabel: string; assetClass: string; linkType: string; weight: number; reviewStatus: string
  }> | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setData(null)
    setError(false)
    fetch(`/api/zone/${zone}/exposures`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setData(d.exposures ?? []))
      .catch(() => setError(true))
  }, [zone])

  if (error) return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Exposure service unreachable.</p>
  if (data === null) return <p className="tabnum text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Loading…</p>
  if (data.length === 0) {
    return (
      <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>
        No exposure linkages curated for this zone yet. Candidates are tracked in the curation queue.
      </p>
    )
  }

  return (
    <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {data.map((e, i) => (
        <li key={i} className="px-2.5 py-1.5">
          <div className="flex items-baseline gap-2">
            <span className="tabnum text-[11px] w-9 text-right shrink-0" style={{ color: 'var(--text)' }}>{fmtPct(e.weight)}</span>
            <span className="text-[11px]" style={{ color: 'var(--text)' }}>{e.instrumentLabel}</span>
            <span className="tabnum text-[10px] ml-auto uppercase shrink-0" style={{ color: 'var(--text-3)' }}>{e.linkType}</span>
          </div>
          {e.reviewStatus !== 'approved' && (
            <p className="tabnum text-[9px] mt-0.5" style={{ color: 'var(--text-3)' }}>weight unreviewed</p>
          )}
        </li>
      ))}
    </ol>
  )
}

function MaritimeTab({ zone }: { zone: string }) {
  const [data, setData] = useState<{
    configured: boolean
    vessels: Array<{ mmsi: string; name: string; lat: number; lng: number; speedKnots: number | null; military: boolean }>
    asOf?: string
    error?: string
  } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setData(null)
    setFailed(false)
    fetch(`/api/maritime/${zone}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true))
  }, [zone])

  if (failed) return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Maritime service unreachable.</p>
  if (data === null) return <p className="tabnum text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Collecting AIS snapshot…</p>

  if (!data.configured) {
    return (
      <div className="p-2.5">
        <div className="label mb-1">Live maritime</div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Vessel traffic requires an AIS feed key (set AISSTREAM_API_KEY).
          No key is configured — no vessel data is shown. Nothing on this tab is simulated.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-baseline justify-between px-2.5 pt-2 pb-1">
        <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
          {data.vessels.length} vessels · as of {data.asOf ? fmtUTC(data.asOf) : '—'}
        </span>
        {data.error && <span className="tabnum text-[10px]" style={{ color: 'var(--stale)' }}>partial</span>}
      </div>
      <p className="text-[10px] px-2.5 pb-1.5" style={{ color: 'var(--text-3)' }}>
        Military flag from AIS ship type 35 — naval vessels often do not broadcast; coverage is partial.
      </p>
      {data.vessels.length === 0 ? (
        <p className="text-[11px] px-2.5 pb-2" style={{ color: 'var(--text-3)' }}>
          No AIS position reports received in the collection window.
        </p>
      ) : (
        <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {data.vessels.map(v => (
            <li key={v.mmsi} className="flex items-baseline gap-2 px-2.5 py-1">
              <span className="text-[11px] truncate" style={{ color: v.military ? 'var(--accent)' : 'var(--text)' }}>
                {v.name || `MMSI ${v.mmsi}`}
              </span>
              {v.military && <span className="label shrink-0" style={{ color: 'var(--accent)' }}>military</span>}
              <span className="tabnum text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-3)' }}>
                {v.speedKnots !== null ? `${v.speedKnots.toFixed(1)} kn` : '—'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
