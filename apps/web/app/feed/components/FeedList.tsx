'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EventCard from './EventCard'
import type { FeedFilters } from './FilterBar'

interface FeedEvent {
  id: string
  title: string
  actor1?: string | null
  actor2?: string | null
  eventType: string
  confidence: string
  sourceTier?: string
  publishedAt: string
  region: string
  sources: { id: string; name: string; url: string }[]
  _count: { sources: number }
}

interface FeedListProps {
  filters: FeedFilters
  onClear?: () => void
}

export default function FeedList({ filters, onClear }: FeedListProps) {
  const [events, setEvents]           = useState<FeedEvent[]>([])
  const [nextCursor, setNextCursor]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [failed, setFailed]           = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const fetchGenRef = useRef(0)

  const fetchPage = useCallback(
    async (cursor: string | null, f: FeedFilters, reset: boolean) => {
      const gen = ++fetchGenRef.current
      setLoading(true)

      const params = new URLSearchParams()
      if (f.region)     params.set('region',     f.region)
      if (f.eventType)  params.set('eventType',  f.eventType)
      if (f.confidence) params.set('confidence', f.confidence)
      if (f.from)       params.set('from',       f.from)
      if (f.to)         params.set('to',         f.to)
      if (cursor)       params.set('cursor',     cursor)

      try {
        const res  = await fetch(`/api/feed?${params}`)
        const data: { events: FeedEvent[]; nextCursor: string | null } = await res.json()
        if (fetchGenRef.current !== gen) return
        setEvents(prev => (reset ? data.events : [...prev, ...data.events]))
        setNextCursor(data.nextCursor)
        setFailed(false)
      } catch {
        // network error — leave existing events visible
        if (fetchGenRef.current === gen && reset) setFailed(true)
      } finally {
        if (fetchGenRef.current === gen) {
          setLoading(false)
          if (reset) setInitialized(true)
        }
      }
    },
    []
  )

  // Reset list and fetch first page whenever filters change
  useEffect(() => {
    setEvents([])
    setNextCursor(null)
    setInitialized(false)
    setFailed(false)
    fetchPage(null, filters, true)
  }, [filters.region, filters.eventType, filters.confidence, filters.from, filters.to, fetchPage])

  // Infinite scroll: watch the sentinel div
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !nextCursor) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !loading) {
          fetchPage(nextCursor, filters, false)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [nextCursor, loading, fetchPage, filters])

  if (!initialized && loading) {
    return (
      <div className="flex-1 flex items-center justify-center tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>
        Loading events…
      </div>
    )
  }

  if (initialized && failed && events.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
        <p className="text-[12px]" style={{ color: 'var(--text-2)' }}>Feed unreachable.</p>
        <button
          onClick={() => fetchPage(null, filters, true)}
          className="tabnum text-[10px] uppercase tracking-[0.08em] px-2 py-1 border"
          style={{ color: 'var(--text-2)', borderColor: 'var(--border-strong)' }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (initialized && events.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
        <p className="text-[12px] text-center max-w-sm" style={{ color: 'var(--text-3)' }}>
          No events match the current filters.
        </p>
        {onClear && (
          <button
            onClick={onClear}
            className="tabnum text-[10px] uppercase tracking-[0.08em] px-2 py-1 border"
            style={{ color: 'var(--text-2)', borderColor: 'var(--border-strong)' }}
          >
            Clear filters
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full border-collapse">
        <tbody>
          {events.map(event => (
            <EventCard
              key={event.id}
              title={event.title}
              actor1={event.actor1}
              actor2={event.actor2}
              eventType={event.eventType}
              confidence={event.confidence}
            sourceTier={event.sourceTier}
              publishedAt={event.publishedAt}
              region={event.region}
              sources={event.sources}
              sourceCount={event._count.sources}
            />
          ))}
        </tbody>
      </table>

      {loading && initialized && (
        <div className="py-3 text-center tabnum text-[11px]" style={{ color: 'var(--text-3)' }}>
          Loading more…
        </div>
      )}

      <div ref={sentinelRef} className="h-4" />
    </div>
  )
}
