# ConflictWatch Phase 2 — Intel Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Intel Feed page (`/feed`) and its backing API (`/api/feed`) with region/type/confidence/date filters and infinite-scroll cursor pagination.

**Architecture:** The `/api/feed` route handler applies Prisma filters and cursor-based pagination (take N+1, return the Nth item as `nextCursor`). The `/feed` page is a client component holding filter state; `FeedList` manages fetch state and an `IntersectionObserver` sentinel for infinite scroll; `FilterBar` is a controlled form; `EventCard` is a pure presentational component.

**Tech Stack:** Next.js 16 App Router · TypeScript · Prisma (`Prisma.EventWhereInput`) · Tailwind CSS v4 · React `useState` / `useEffect` / `useRef` / `useCallback`

---

## File Map

```
apps/web/app/
├── api/
│   └── feed/
│       └── route.ts                     ← GET /api/feed: filters + cursor pagination
└── feed/
    ├── page.tsx                          ← Intel Feed page ('use client')
    └── components/
        ├── FilterBar.tsx                 ← Region/type/confidence/date controls; exports FeedFilters
        ├── EventCard.tsx                 ← Single event card (presentational, no state)
        └── FeedList.tsx                  ← Infinite-scroll list; owns fetch + pagination state
```

---

## Task 1: `/api/feed` route — filters and cursor pagination

**Files:**
- Create: `apps/web/app/api/feed/route.ts`

- [ ] **Step 1.1: Create `apps/web/app/api/feed/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma, type Prisma } from '@conflictwatch/db'

const PAGE_SIZE = 20

function toEndOfDay(dateStr: string): Date {
  const d = new Date(dateStr)
  d.setUTCHours(23, 59, 59, 999)
  return d
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const region     = searchParams.get('region')
  const eventType  = searchParams.get('eventType')
  const confidence = searchParams.get('confidence')
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const cursor     = searchParams.get('cursor')

  const where: Prisma.EventWhereInput = {}

  if (region)     where.region     = { contains: region, mode: 'insensitive' }
  if (eventType)  where.eventType  = eventType
  if (confidence) where.confidence = confidence
  if (from || to) {
    where.publishedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: toEndOfDay(to) } : {}),
    }
  }

  const events = await prisma.event.findMany({
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where,
    orderBy: [
      { publishedAt: 'desc' },
      { id: 'desc' },
    ],
    include: {
      sources: {
        select: { id: true, name: true, url: true },
        take: 5,
      },
      _count: { select: { sources: true } },
    },
  })

  const hasMore   = events.length > PAGE_SIZE
  const items     = hasMore ? events.slice(0, PAGE_SIZE) : events
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return NextResponse.json({ events: items, nextCursor })
}
```

- [ ] **Step 1.2: Verify the route returns data**

With the Next.js dev server running (`DATABASE_URL=... pnpm --filter web dev`):

```bash
# No filters — first page
curl -s "http://localhost:3000/api/feed" | jq '{count: (.events | length), nextCursor}'

# With region filter
curl -s "http://localhost:3000/api/feed?region=Ukraine" | jq '{count: (.events | length), nextCursor}'

# Second page (substitute a real id from the previous response)
curl -s "http://localhost:3000/api/feed?cursor=LAST_EVENT_ID" | jq '{count: (.events | length), nextCursor}'
```

Expected: `count` is ≤20, `nextCursor` is a cuid string or null.

- [ ] **Step 1.3: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 1.4: Commit**

```bash
cd ~/conflictwatch
git add apps/web/app/api/feed/route.ts
git commit -m "feat: add /api/feed with filters and cursor pagination"
```

---

## Task 2: `EventCard` — event display card

**Files:**
- Create: `apps/web/app/feed/components/EventCard.tsx`

- [ ] **Step 2.1: Create directories**

```bash
mkdir -p ~/conflictwatch/apps/web/app/feed/components
```

- [ ] **Step 2.2: Create `apps/web/app/feed/components/EventCard.tsx`**

```tsx
interface Source {
  id: string
  name: string
  url: string
}

interface EventCardProps {
  title: string
  eventType: string
  confidence: string
  publishedAt: string
  region: string
  sources: Source[]
  sourceCount: number
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   'text-green-400 border-green-400',
  medium: 'text-amber-400 border-amber-400',
  low:    'text-gray-400 border-gray-500',
}

export default function EventCard({
  title,
  eventType,
  confidence,
  publishedAt,
  region,
  sources,
  sourceCount,
}: EventCardProps) {
  return (
    <div className="border border-[#1f2937] rounded-lg p-4 space-y-3 bg-[#111827]">
      <p className="text-sm text-gray-200 leading-snug">{title}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs border rounded px-1.5 py-0.5 font-mono ${
            CONFIDENCE_COLORS[confidence] ?? CONFIDENCE_COLORS.low
          }`}
        >
          {confidence}
        </span>
        <span className="text-xs bg-[#1f2937] text-gray-300 rounded px-1.5 py-0.5 font-mono">
          {eventType}
        </span>
        <span className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{region}</span>
        <span className="text-xs text-gray-500 font-mono ml-auto">
          {new Date(publishedAt).toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-mono">
          {sourceCount} source{sourceCount !== 1 ? 's' : ''}
        </span>
        {sources.map(src => (
          <a
            key={src.id}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline truncate max-w-[150px]"
          >
            {src.name}
          </a>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2.3: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 2.4: Commit**

```bash
cd ~/conflictwatch
git add apps/web/app/feed/components/EventCard.tsx
git commit -m "feat: add EventCard component for Intel Feed"
```

---

## Task 3: `FilterBar` — filter form

**Files:**
- Create: `apps/web/app/feed/components/FilterBar.tsx`

- [ ] **Step 3.1: Create `apps/web/app/feed/components/FilterBar.tsx`**

```tsx
'use client'

export interface FeedFilters {
  region: string
  eventType: string
  confidence: string
  from: string
  to: string
}

export const EMPTY_FILTERS: FeedFilters = {
  region: '',
  eventType: '',
  confidence: '',
  from: '',
  to: '',
}

interface FilterBarProps {
  filters: FeedFilters
  onChange: (filters: FeedFilters) => void
}

const EVENT_TYPES = [
  'diplomatic',
  'cooperation',
  'dispute',
  'investigation',
  'demand',
  'disapproval',
  'rejection',
  'threat',
  'protest',
  'posturing',
  'sanctions',
  'coercion',
  'assault',
  'armed-conflict',
  'mass-violence',
  'other',
]

const INPUT_CLS =
  'bg-[#0a0f1a] border border-[#1f2937] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-gray-500'

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const update = (key: keyof FeedFilters, value: string) =>
    onChange({ ...filters, [key]: value })

  const hasFilters =
    filters.region ||
    filters.eventType ||
    filters.confidence ||
    filters.from ||
    filters.to

  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-[#1f2937] bg-[#0d131f]">
      <input
        type="text"
        placeholder="Region…"
        value={filters.region}
        onChange={e => update('region', e.target.value)}
        className={`${INPUT_CLS} w-44 placeholder-gray-500`}
      />

      <select
        value={filters.eventType}
        onChange={e => update('eventType', e.target.value)}
        className={INPUT_CLS}
      >
        <option value="">All types</option>
        {EVENT_TYPES.map(t => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        value={filters.confidence}
        onChange={e => update('confidence', e.target.value)}
        className={INPUT_CLS}
      >
        <option value="">All confidence</option>
        <option value="high">high</option>
        <option value="medium">medium</option>
        <option value="low">low</option>
      </select>

      <input
        type="date"
        value={filters.from}
        onChange={e => update('from', e.target.value)}
        className={INPUT_CLS}
      />
      <span className="text-gray-500 text-sm select-none">→</span>
      <input
        type="date"
        value={filters.to}
        onChange={e => update('to', e.target.value)}
        className={INPUT_CLS}
      />

      {hasFilters && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs text-gray-400 hover:text-white font-mono ml-1"
        >
          clear
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3.2: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
cd ~/conflictwatch
git add apps/web/app/feed/components/FilterBar.tsx
git commit -m "feat: add FilterBar component with region/type/confidence/date controls"
```

---

## Task 4: `FeedList` — infinite-scroll paginated event list

**Files:**
- Create: `apps/web/app/feed/components/FeedList.tsx`

- [ ] **Step 4.1: Create `apps/web/app/feed/components/FeedList.tsx`**

```tsx
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
  const [events, setEvents]         = useState<FeedEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
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
```

- [ ] **Step 4.2: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
cd ~/conflictwatch
git add apps/web/app/feed/components/FeedList.tsx
git commit -m "feat: add FeedList with cursor pagination and IntersectionObserver infinite scroll"
```

---

## Task 5: Intel Feed page — assemble everything

**Files:**
- Create: `apps/web/app/feed/page.tsx`

- [ ] **Step 5.1: Create `apps/web/app/feed/page.tsx`**

```tsx
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
```

- [ ] **Step 5.2: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5.3: Verify the feed in the browser**

With the dev server running:

```bash
cd apps/web
DATABASE_URL="postgresql://conflictwatch:conflictwatch@localhost:5432/conflictwatch" pnpm dev
```

Open `http://localhost:3000/feed`. Check:
- Page loads with "INTEL FEED" header and "← MAP" link
- Event cards appear in reverse-chronological order
- Each card shows: title, confidence badge (colored), event type tag, region, timestamp, source count, source links
- Scrolling to the bottom loads the next page (infinite scroll)
- Typing in the Region filter narrows results (1-2 second delay is normal — no debounce)
- Selecting event type or confidence from dropdowns filters correctly
- Setting a date range (from/to) filters to that window
- The "clear" button appears when any filter is active and resets all filters

- [ ] **Step 5.4: Commit**

```bash
cd ~/conflictwatch
git add apps/web/app/feed/page.tsx
git commit -m "feat: add Intel Feed page with filter bar and infinite scroll"
```

---

## Phase 2 complete

**What's running:**
- `GET /api/feed` — filtered, cursor-paginated event stream
- `/feed` page — filter bar + infinite-scroll event list, navigates back to War Map

**Next:** Phase 3 — AI Layer (Claude assessment generator in worker, `/predictions` + `/report` pages)
