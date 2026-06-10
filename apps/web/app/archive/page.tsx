'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import TerminalShell from '../components/TerminalShell'
import Panel from '../components/Panel'
import SevMark from '../components/SevMark'
import { fmtUTC } from '../lib/tokens'

interface ArchiveEvent {
  id: string
  title: string
  summary: string
  severity: number
  category: string
  significance: string
  region: string
  sourceTier: string
  confidence: string
  publishedAt: string
}

const CATEGORIES = ['armed-conflict', 'terrorism', 'insurgency', 'civil-unrest', 'state-violence', 'political-instability']

export default function ArchivePage() {
  const [country, setCountry] = useState('')
  const [category, setCategory] = useState('')
  const [minSeverity, setMinSeverity] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [events, setEvents] = useState<ArchiveEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [initialized, setInitialized] = useState(false)
  const gen = useRef(0)

  const load = useCallback((cursor: string | null, reset: boolean) => {
    const my = ++gen.current
    setState('loading')
    const p = new URLSearchParams()
    if (country) p.set('country', country)
    if (category) p.set('category', category)
    if (minSeverity) p.set('minSeverity', minSeverity)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (cursor) p.set('cursor', cursor)
    fetch(`/api/archive?${p}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { events: ArchiveEvent[]; nextCursor: string | null }) => {
        if (gen.current !== my) return
        setEvents(prev => (reset ? d.events : [...prev, ...d.events]))
        setNextCursor(d.nextCursor)
        setState('idle')
        setInitialized(true)
      })
      .catch(() => { if (gen.current === my) { setState('error'); setInitialized(true) } })
  }, [country, category, minSeverity, from, to])

  useEffect(() => {
    const t = setTimeout(() => load(null, true), country ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, country])

  const sidebar = (
    <div className="p-2.5 space-y-2.5">
      <div className="label">Search archive</div>
      <label className="block">
        <span className="label">Country / region</span>
        <input value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Ukraine" className="field w-full mt-0.5" />
      </label>
      <label className="block">
        <span className="label">Category</span>
        <select value={category} onChange={e => setCategory(e.target.value)} className="field w-full mt-0.5">
          <option value="">All</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Min severity</span>
        <select value={minSeverity} onChange={e => setMinSeverity(e.target.value)} className="field w-full mt-0.5">
          <option value="">Any</option>
          {[1, 2, 3, 4, 5].map(s => <option key={s} value={s}>S{s}+</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">From</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="field w-full mt-0.5" />
      </label>
      <label className="block">
        <span className="label">To</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="field w-full mt-0.5" />
      </label>
    </div>
  )

  return (
    <TerminalShell sidebar={sidebar}>
      <div className="flex-1 min-h-0 p-1.5">
        <Panel
          title="Intel archive"
          flush
          className="h-full"
          meta={<span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{events.length} loaded</span>}
        >
          <div className="h-full overflow-y-auto">
            {state === 'error' ? (
              <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Archive service unreachable.</p>
            ) : initialized && events.length === 0 ? (
              <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>
                No archived events match these filters. The archive grows as ingestion runs.
              </p>
            ) : (
              <>
                <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {events.map(e => (
                    <li key={e.id} className="px-2.5 py-2">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <SevMark level={e.severity} />
                        {e.category && <span className="tabnum text-[10px] uppercase" style={{ color: 'var(--text-2)' }}>{e.category}</span>}
                        {e.significance && <span className="tabnum text-[10px]" style={{ color: 'var(--text-3)' }}>{e.significance}</span>}
                        <span className="tabnum text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-3)' }}>{fmtUTC(e.publishedAt)}</span>
                      </div>
                      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text)' }}>{e.title}</p>
                      {e.summary && <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: 'var(--text-2)' }}>{e.summary}</p>}
                      {e.region && <p className="tabnum text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{e.region}</p>}
                    </li>
                  ))}
                </ol>
                {nextCursor && (
                  <div className="p-2.5 text-center">
                    <button
                      onClick={() => load(nextCursor, false)}
                      disabled={state === 'loading'}
                      className="text-[11px] px-3 py-1 border rounded-[2px] hover:text-white"
                      style={{ color: 'var(--text-2)', borderColor: 'var(--border-strong)' }}
                    >
                      {state === 'loading' ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>
    </TerminalShell>
  )
}
