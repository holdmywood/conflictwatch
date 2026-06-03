'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ConflictPanel from './components/ConflictPanel'
import LiveIndicator from './components/LiveIndicator'
import type { ConflictPoint } from './components/Globe'

const Globe = dynamic(() => import('./components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-gray-400 font-mono text-sm">
      Initializing globe…
    </div>
  ),
})

export default function WarMapPage() {
  const [conflicts, setConflicts] = useState<ConflictPoint[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/conflicts')
      .then(r => r.json())
      .then(setConflicts)
  }, [])

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0f1a]">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-[#0a0f1a]/80 backdrop-blur border-b border-[#1f2937]">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm font-bold tracking-widest text-gray-200">
            CONFLICTWATCH
          </span>
          <Link href="/feed" className="text-gray-500 hover:text-gray-200 font-mono text-xs">
            INTEL FEED
          </Link>
          <Link href="/predictions" className="text-gray-500 hover:text-gray-200 font-mono text-xs">
            PREDICTIONS
          </Link>
          <Link href="/report" className="text-gray-500 hover:text-gray-200 font-mono text-xs">
            DAILY REPORT
          </Link>
        </div>
        <LiveIndicator />
      </div>

      {/* Globe */}
      <div className="w-full h-full pt-10">
        <Globe
          conflicts={conflicts}
          onSelect={(c) => setSelectedId(c.id)}
        />
      </div>

      {/* Detail panel */}
      <ConflictPanel
        conflictId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
