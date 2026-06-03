'use client'

import { useState } from 'react'
import Link from 'next/link'
import FilterBar, { EMPTY_FILTERS, type FeedFilters } from './components/FilterBar'
import FeedList from './components/FeedList'

export default function FeedPage() {
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_FILTERS)

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1a]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f2937] bg-[#0a0f1a]/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-200 font-mono text-xs">
            ← MAP
          </Link>
          <span className="font-mono text-sm font-bold tracking-widest text-gray-200">
            INTEL FEED
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="shrink-0">
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {/* Scrollable event list */}
      <FeedList filters={filters} />
    </div>
  )
}
