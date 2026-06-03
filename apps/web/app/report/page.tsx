'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ReportSection {
  id: string
  region: string
  body: string
  confidence: string
  createdAt: string
  usedEventIds: string[]
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   'text-green-400 border-green-400',
  medium: 'text-amber-400 border-amber-400',
  low:    'text-gray-400 border-gray-500',
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function ReportPage() {
  const [date, setDate] = useState(todayDateString())
  const [reports, setReports] = useState<ReportSection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/report?date=${date}`)
      .then(r => r.json())
      .then(d => {
        setReports(d.reports ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load report')
        setLoading(false)
      })
  }, [date])

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0f1a]">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-[#1f2937] bg-[#0a0f1a]/80 backdrop-blur">
        <Link href="/" className="text-gray-500 hover:text-gray-200 font-mono text-xs">
          ← MAP
        </Link>
        <Link href="/feed" className="text-gray-500 hover:text-gray-200 font-mono text-xs">
          INTEL FEED
        </Link>
        <span className="font-mono text-sm font-bold tracking-widest text-gray-200">
          DAILY REPORT
        </span>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-gray-400">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-[#111827] border border-[#1f2937] text-gray-200 font-mono text-sm rounded px-2 py-1"
          />
        </div>

        {loading && (
          <p className="text-gray-500 font-mono text-sm">Loading...</p>
        )}
        {error && (
          <p className="text-red-400 font-mono text-sm">{error}</p>
        )}
        {!loading && !error && reports.length === 0 && (
          <p className="text-gray-500 font-mono text-sm">
            No report available for this date.
          </p>
        )}
        {reports.map(section => (
          <div
            key={section.id}
            className="border-l-2 border-amber-400 bg-[#111827] rounded-r-lg p-4 space-y-3"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-amber-400 border border-amber-400 px-1.5 py-0.5 rounded">
                AI ASSESSMENT
              </span>
              <span className="text-xs font-mono text-gray-300">{section.region}</span>
              <span
                className={`text-xs font-mono border rounded px-1.5 py-0.5 ${
                  CONFIDENCE_COLORS[section.confidence] ?? CONFIDENCE_COLORS.low
                }`}
              >
                {section.confidence}
              </span>
              <span className="text-xs font-mono text-gray-500 ml-auto">
                {new Date(section.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm text-gray-200 leading-relaxed">{section.body}</p>
            {section.usedEventIds.length > 0 && (
              <p className="text-xs font-mono text-gray-600">
                Sources: {section.usedEventIds.join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
