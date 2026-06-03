'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EventCard from './EventCard'
import type { FeedFilters } from './FilterBar'

interface FeedEvent {
  id: string
  title: string
  eventType: string
  confidence: string
  publishedAt: string
  region: string
  sources: { id: string; name: string; url: string }[]
  _count: { sources: number }
}

interface FeedListProps {
  filters: FeedFilters
}

export default function FeedList({ filters }: FeedListProps) {
  const [events, setEvents]           = useState<FeedEvent[]>([])
  const [nextCursor, setNextCursor]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [initialized, setInitialized] = useState(false)
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
      } catch {
        // network error — leave existing events visible
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
      <div className="flex-1 flex items-center justify-center text-gray-400 font-mono text-sm">
        Loading intel…
      </div>
    )
  }

  if (initialized && events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 font-mono text-sm">
        No events match the current filters.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        {events.map(event => (
          <EventCard
            key={event.id}
            title={event.title}
            eventType={event.eventType}
            confidence={event.confidence}
            publishedAt={event.publishedAt}
            region={event.region}
            sources={event.sources}
            sourceCount={event._count.sources}
          />
        ))}

        {loading && initialized && (
          <div className="py-4 text-center text-gray-400 font-mono text-sm">
            Loading more…
          </div>
        )}

        <div ref={sentinelRef} className="h-4" />
      </div>
    </div>
  )
}
