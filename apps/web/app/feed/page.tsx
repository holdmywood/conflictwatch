'use client'

import { useState } from 'react'
import TerminalShell from '../components/TerminalShell'
import FilterBar, { EMPTY_FILTERS, type FeedFilters } from './components/FilterBar'
import FeedList from './components/FeedList'

export default function FeedPage() {
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_FILTERS)

  return (
    <TerminalShell>
      <FilterBar filters={filters} onChange={setFilters} />
      <FeedList filters={filters} onClear={() => setFilters(EMPTY_FILTERS)} />
    </TerminalShell>
  )
}
