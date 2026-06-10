'use client'

import { useEffect, useState } from 'react'
import TerminalShell from '../components/TerminalShell'
import Panel from '../components/Panel'
import SevMark from '../components/SevMark'
import { fmtUTC } from '../lib/tokens'

interface NewsEvent {
  id: string
  title: string
  summary: string
  severity: number
  category: string
  region: string
  sourceTier: string
  confidence: string
  publishedAt: string
  sources: Array<{ id: string; name: string; url: string }>
}

interface TopConflict {
  id: string
  name: string
  region: string
  threatLevel: number
  reportCount: number
  pEscalation: number | null
}

interface Instrument {
  instrument: string
  label: string
  assetClass: string
  price: number | null
  changePct: number | null
}

const CATEGORIES = ['armed-conflict', 'terrorism', 'insurgency', 'civil-unrest', 'state-violence', 'political-instability']

export default function NewsPage() {
  const [events, setEvents] = useState<NewsEvent[] | null>(null)
  const [eventsError, setEventsError] = useState(false)
  const [region, setRegion] = useState('')
  const [category, setCategory] = useState('')
  const [top, setTop] = useState<TopConflict[]>([])
  const [commodities, setCommodities] = useState<{ configured: boolean; instruments: Instrument[] } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (region) params.set('region', region)
    if (category) params.set('eventType', category)
    setEvents(null)
    setEventsError(false)
    const t = setTimeout(() => {
      fetch(`/api/feed?${params}`)
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then((d: { events: NewsEvent[] }) => setEvents(d.events))
        .catch(() => setEventsError(true))
    }, region ? 300 : 0)
    return () => clearTimeout(t)
  }, [region, category])

  useEffect(() => {
    fetch('/api/top-conflicts').then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { conflicts: TopConflict[] }) => setTop(d.conflicts)).catch(() => {})
    fetch('/api/commodities').then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setCommodities).catch(() => {})
  }, [])

  const sidebar = (
    <div className="py-1">
      <div className="label px-2.5 py-1.5">Top conflicts · 7d</div>
      {top.length === 0 ? (
        <p className="text-[11px] px-2.5 py-2" style={{ color: 'var(--text-3)' }}>
          No ranked conflicts yet. Populates after ingestion.
        </p>
      ) : (
        <ol>
          {top.map((c, i) => (
            <li key={c.id} className="flex items-baseline gap-2 px-2.5 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="tabnum text-[10px] w-4 text-right shrink-0" style={{ color: 'var(--text-3)' }}>{i + 1}</span>
              <SevMark level={c.threatLevel} />
              <span className="text-[11px] truncate" style={{ color: 'var(--text)' }}>{c.name}</span>
              <span className="tabnum text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-2)' }}>{c.reportCount}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )

  return (
    <TerminalShell sidebar={sidebar}>
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 p-1.5">
        {/* Commodities strip — informational, exposure-linked */}
        <Panel
          title="Commodities"
          meta={<span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>
            {commodities?.configured ? 'live' : 'no price source'}
          </span>}
          className="shrink-0"
        >
          {!commodities ? (
            <p className="tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {commodities.instruments.map(it => (
                <div key={it.instrument} className="flex items-baseline gap-1.5">
                  <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>{it.label}</span>
                  <span className="tabnum text-[11px]" style={{ color: 'var(--text)' }}>
                    {it.price !== null ? it.price.toFixed(2) : '—'}
                  </span>
                </div>
              ))}
              <span className="text-[10px] w-full mt-0.5" style={{ color: 'var(--text-3)' }}>
                Instruments linked to active exposure zones. Prices require a market-data key (informational only — not investment advice).
              </span>
            </div>
          )}
        </Panel>

        {/* News reading column */}
        <Panel
          title="Latest news"
          flush
          className="flex-1 min-h-0"
          meta={
            <div className="flex items-center gap-1.5">
              <input
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="Region…"
                className="field"
                style={{ width: 120, fontSize: 11, padding: '2px 6px' }}
                aria-label="Filter by region"
              />
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="field"
                style={{ fontSize: 11, padding: '2px 6px' }}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          }
        >
          <div className="h-full overflow-y-auto">
            <NewsList events={events} error={eventsError} />
          </div>
        </Panel>
      </div>
    </TerminalShell>
  )
}

function NewsList({ events, error }: { events: NewsEvent[] | null; error: boolean }) {
  if (error) return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>News service unreachable.</p>
  if (events === null) return <p className="tabnum text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Loading…</p>
  if (events.length === 0) {
    return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>No items match the current filters. The feed fills as ingestion runs.</p>
  }
  return (
    <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {events.map(e => <NewsRow key={e.id} e={e} />)}
    </ol>
  )
}

function NewsRow({ e }: { e: NewsEvent }) {
  return (
    <li className="px-2.5 py-2">
      <div className="flex items-baseline gap-2 mb-0.5">
        <SevMark level={e.severity} />
        {e.category && <span className="tabnum text-[10px] uppercase" style={{ color: 'var(--text-2)' }}>{e.category}</span>}
        {e.sourceTier && <span className="tabnum text-[10px] uppercase" style={{ color: 'var(--text-3)' }}>{e.sourceTier}</span>}
        <span className="tabnum text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-3)' }}>{fmtUTC(e.publishedAt)}</span>
      </div>
      {/* AI-generated factual title — never a templated actor string */}
      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text)' }}>{e.title}</p>
      {e.summary && <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: 'var(--text-2)' }}>{e.summary}</p>}
      <div className="flex items-baseline gap-2 mt-1">
        {e.region && <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{e.region}</span>}
        {e.sources.length > 0 && (
          <span className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
            {e.sources.slice(0, 3).map((s, i) => (
              <span key={s.id}>
                {i > 0 && ' · '}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--text-2)' }}>{s.name}</a>
              </span>
            ))}
          </span>
        )}
      </div>
    </li>
  )
}
