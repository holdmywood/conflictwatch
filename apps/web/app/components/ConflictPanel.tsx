'use client'

import { useEffect, useState } from 'react'
import type { ConflictPoint } from './Globe'

interface Event {
  id: string
  title: string
  eventType: string
  confidence: string
  publishedAt: string
  sources: { id: string; name: string; url: string }[]
}

interface ConflictDetail {
  conflict: ConflictPoint
  events: Event[]
}

interface ConflictPanelProps {
  conflictId: string | null
  onClose: () => void
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-green-400 border-green-400',
  medium: 'text-amber-400 border-amber-400',
  low: 'text-gray-400 border-gray-500',
}

export default function ConflictPanel({ conflictId, onClose }: ConflictPanelProps) {
  const [detail, setDetail] = useState<ConflictDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!conflictId) return
    setLoading(true)
    fetch(`/api/conflict/${conflictId}`)
      .then(r => r.json())
      .then(data => {
        setDetail(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [conflictId])

  if (!conflictId) return null

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-[#111827] border-l border-[#1f2937] z-10 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-[#1f2937]">
        <h2 className="text-lg font-semibold truncate">
          {detail?.conflict.name ?? 'Loading…'}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl leading-none ml-2"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {loading && (
        <div className="p-4 text-gray-400 font-mono text-sm">Fetching intel…</div>
      )}

      {detail && (
        <div className="p-4 space-y-4">
          <div className="flex gap-3 text-sm font-mono text-gray-400">
            <span>Threat: <span className="text-white">{detail.conflict.threatLevel}/5</span></span>
            <span>Events: <span className="text-white">{detail.events.length}</span></span>
          </div>

          <div className="space-y-3">
            {detail.events.map(event => (
              <div key={event.id} className="border border-[#1f2937] rounded p-3 space-y-2">
                <p className="text-sm text-gray-200 leading-snug">{event.title}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs border rounded px-1.5 py-0.5 font-mono ${CONFIDENCE_COLORS[event.confidence] ?? CONFIDENCE_COLORS.low}`}>
                    {event.confidence}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">{event.eventType}</span>
                  <span className="text-xs text-gray-500 font-mono">
                    {new Date(event.publishedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.sources.map(src => (
                    <a
                      key={src.id}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline truncate max-w-[140px]"
                    >
                      {src.name}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
