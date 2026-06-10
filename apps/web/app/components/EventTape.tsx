'use client'

import { useEffect, useState } from 'react'
import { fmtUTC } from '../lib/tokens'

const REFRESH_MS = 60_000

interface TapeEvent {
  id: string
  title: string
  eventType: string
  confidence: string
  publishedAt: string
  region: string
}

/**
 * Latest classified events across all theaters, newest first.
 */
export default function EventTape() {
  const [events, setEvents] = useState<TapeEvent[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const load = () =>
      fetch('/api/feed')
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then((d: { events: TapeEvent[] }) => { setEvents(d.events); setState('ready') })
        .catch(() => setState(s => (s === 'ready' ? s : 'error')))
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  if (state === 'loading') {
    return <p className="tabnum text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Loading events…</p>
  }
  if (state === 'error') {
    return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Feed unreachable. Retrying every 60s.</p>
  }
  if (events.length === 0) {
    return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>No classified events yet. The tape fills as ingestion runs.</p>
  }

  return (
    <table className="w-full border-collapse">
      <tbody>
        {events.slice(0, 40).map(e => (
          <tr key={e.id} className="border-b align-baseline" style={{ borderColor: 'var(--border)' }}>
            <td className="tabnum text-[10px] px-2.5 py-[5px] whitespace-nowrap w-px" style={{ color: 'var(--text-3)' }}>
              {fmtUTC(e.publishedAt)}
            </td>
            <td className="tabnum text-[10px] uppercase px-2 py-[5px] whitespace-nowrap w-px" style={{ color: 'var(--text-2)' }}>
              {e.eventType}
            </td>
            <td className="text-[12px] px-2 py-[5px] leading-snug" style={{ color: 'var(--text)' }}>
              <span className="line-clamp-1">{e.title}</span>
            </td>
            <td className="text-[10px] px-2.5 py-[5px] text-right whitespace-nowrap w-px hidden lg:table-cell" style={{ color: 'var(--text-3)' }}>
              {e.region}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
