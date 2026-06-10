'use client'

import { useEffect, useState } from 'react'
import { fmtUTC } from '../lib/tokens'
import type { ConflictPoint } from './Globe'

interface Event {
  id: string
  title: string
  actor1?: string | null
  actor2?: string | null
  eventType: string
  confidence: string
  publishedAt: string
  sources: { id: string; name: string; url: string }[]
}

interface ConflictDetail {
  conflict: ConflictPoint
  events: Event[]
}

/**
 * Recent events for the selected conflict — right-rail panel body.
 */
export default function ConflictPanel({ conflictId }: { conflictId: string | null }) {
  const [detail, setDetail] = useState<ConflictDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!conflictId) return
    setLoading(true)
    setError(false)
    fetch(`/api/conflict/${conflictId}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setDetail(data))
      .catch(() => { setDetail(null); setError(true) })
      .finally(() => setLoading(false))
  }, [conflictId])

  if (!conflictId) {
    return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Select a conflict to view its event history.</p>
  }
  if (loading) {
    return <p className="tabnum text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Loading events…</p>
  }
  if (error || !detail) {
    return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>Event service unreachable. Select the conflict again to retry.</p>
  }
  if (detail.events.length === 0) {
    return <p className="text-[11px] p-2.5" style={{ color: 'var(--text-3)' }}>No events recorded for this conflict yet.</p>
  }

  return (
    <ol className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {detail.events.map(event => (
        <li key={event.id} className="px-2.5 py-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-baseline gap-2">
            <span className="tabnum text-[10px] shrink-0" style={{ color: 'var(--text-3)' }}>
              {fmtUTC(event.publishedAt)}
            </span>
            <span className="tabnum text-[10px] uppercase shrink-0" style={{ color: 'var(--text-2)' }}>
              {event.eventType}
            </span>
            <span className="tabnum text-[10px] uppercase ml-auto shrink-0" style={{ color: 'var(--text-3)' }}>
              conf {event.confidence}
            </span>
          </div>
          {(event.actor1 || event.actor2) && (
            <p className="tabnum text-[10px] mt-1" style={{ color: 'var(--text-2)' }}>
              {[event.actor1, event.actor2].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text)' }}>{event.title}</p>
          {event.sources.length > 0 && (
            <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--text-3)' }}>
              {event.sources.map((src, i) => (
                <span key={src.id}>
                  {i > 0 && ' · '}
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--text-2)' }}>
                    {src.name}
                  </a>
                </span>
              ))}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
