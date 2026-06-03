'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AssessmentCard from './components/AssessmentCard'

interface Assessment {
  id: string
  region: string
  body: string
  confidence: string
  createdAt: string
  usedEventIds: string[]
}

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/predictions')
      .then(r => r.json())
      .then(d => {
        setPredictions(d.predictions)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load predictions')
        setLoading(false)
      })
  }, [])

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
          PREDICTIONS
        </span>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
        {loading && (
          <p className="text-gray-500 font-mono text-sm">Loading...</p>
        )}
        {error && (
          <p className="text-red-400 font-mono text-sm">{error}</p>
        )}
        {!loading && !error && predictions.length === 0 && (
          <p className="text-gray-500 font-mono text-sm">
            No predictions available yet. Check back after the worker has run.
          </p>
        )}
        {predictions.map(p => (
          <AssessmentCard key={p.id} {...p} />
        ))}
      </div>
    </div>
  )
}
