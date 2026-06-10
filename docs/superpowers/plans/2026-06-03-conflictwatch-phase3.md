# ConflictWatch Phase 3 — AI Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Claude-powered assessment generator to the worker and expose AI predictions and daily reports through two new API routes and two new pages.

**Architecture:** The worker gains an `ai/assessor.ts` module that calls the Anthropic API (claude-sonnet-4-6 with prompt caching) to generate per-region predictions hourly and daily reports at midnight; assessments are stored in the `Assessment` Postgres table with `usedEventIds` for traceability. When a conflict's `threatLevel` changes by ≥2 points during ingestion, an immediate prediction is triggered for that conflict. The web app adds `/api/predictions` and `/api/report` API routes and two matching pages with the amber-bordered "AI ASSESSMENT" treatment defined in the design spec. Auth gating (`withTier("pro")`) is added in Phase 4.

**Tech Stack:** `@anthropic-ai/sdk` (worker), `node-cron` (worker, already installed), Next.js 16 App Router (web), Prisma 5 shared DB, Tailwind CSS v4, vitest (worker tests)

---

## File Map

### New files
| File | Purpose |
|---|---|
| `apps/worker/src/ai/assessor.ts` | Claude API calls + DB persistence + cron runners + threat-jump trigger |
| `apps/worker/src/ai/assessor.test.ts` | Unit tests for assessor (mocked Anthropic + Prisma) |
| `apps/web/app/api/predictions/route.ts` | `GET /api/predictions` — latest prediction per region |
| `apps/web/app/api/report/route.ts` | `GET /api/report?date=YYYY-MM-DD` — daily report assessments |
| `apps/web/app/predictions/components/AssessmentCard.tsx` | Amber-bordered AI ASSESSMENT card (shared by both pages) |
| `apps/web/app/predictions/page.tsx` | `/predictions` page |
| `apps/web/app/report/page.tsx` | `/report` page with date picker |

### Modified files
| File | Change |
|---|---|
| `apps/worker/package.json` | Add `@anthropic-ai/sdk` dependency |
| `apps/worker/src/pipeline/persist.ts` | `persistEvent` returns `{ threatLevelJumped: boolean; conflictId: string }` |
| `apps/worker/src/pipeline/persist.test.ts` | Add `findUnique` mock; add threat-jump return tests |
| `apps/worker/src/index.ts` | Import assessor; add hourly + daily crons; wire threat-jump trigger |

---

## Task 1: Add Anthropic SDK to Worker

**Files:**
- Modify: `apps/worker/package.json`

No TDD for a dependency install. Steps:

- [ ] **Step 1: Add SDK dependency**

In `apps/worker/package.json`, add `"@anthropic-ai/sdk"` to `"dependencies"`:

```json
{
  "name": "worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "@conflictwatch/db": "workspace:*",
    "axios": "^1.7.2",
    "csv-parse": "^5.5.6",
    "dotenv": "^17.4.2",
    "ioredis": "^5.4.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.15.7",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm install
```

Expected: packages installed, no errors.

- [ ] **Step 3: Verify SDK is available**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm list --filter worker @anthropic-ai/sdk
```

Expected: output includes `@anthropic-ai/sdk` with a version number.

- [ ] **Step 4: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/worker/package.json pnpm-lock.yaml && git commit -m "feat: add @anthropic-ai/sdk to worker"
```

---

## Task 2: Assessment Generator

**Files:**
- Create: `apps/worker/src/ai/assessor.ts`
- Create: `apps/worker/src/ai/assessor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/worker/src/ai/assessor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMessagesCreate = vi.fn()
const mockAssessmentCreate = vi.fn().mockResolvedValue({ id: 'asmt-1' })
const mockConflictFindMany = vi.fn().mockResolvedValue([])
const mockConflictFindUnique = vi.fn().mockResolvedValue(null)

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}))

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    assessment: { create: mockAssessmentCreate },
    conflict: {
      findMany: mockConflictFindMany,
      findUnique: mockConflictFindUnique,
    },
  },
}))

const { generatePrediction, generateDailyReport } = await import('./assessor.js')

const sampleEvents = [
  {
    id: 'evt-1',
    title: 'Russia: armed-conflict in Kyiv, Ukraine',
    eventType: 'armed-conflict',
    confidence: 'high',
    publishedAt: new Date('2026-06-03T10:00:00Z'),
    region: 'Kyiv, Ukraine',
  },
]

describe('generatePrediction', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
    mockAssessmentCreate.mockReset().mockResolvedValue({ id: 'asmt-1' })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Escalation likely over the next 24 hours.' }],
    })
  })

  it('stores a prediction assessment with correct kind and region', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'prediction',
        region: 'conflict-ua',
        body: 'Escalation likely over the next 24 hours.',
        usedEventIds: ['evt-1'],
      }),
    })
  })

  it('does not call Claude when events array is empty', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', [])
    expect(mockMessagesCreate).not.toHaveBeenCalled()
    expect(mockAssessmentCreate).not.toHaveBeenCalled()
  })

  it('calls Claude with model claude-sonnet-4-6', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' })
    )
  })

  it('derives high confidence when any event is high', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ confidence: 'high' }),
    })
  })

  it('derives low confidence when all events are low', async () => {
    const lowEvents = [{ ...sampleEvents[0], confidence: 'low' }]
    await generatePrediction('conflict-ua', 'Ukraine', lowEvents)
    expect(mockAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ confidence: 'low' }),
    })
  })
})

describe('generateDailyReport', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
    mockAssessmentCreate.mockReset().mockResolvedValue({ id: 'asmt-2' })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Heavy fighting reported in eastern regions.' }],
    })
  })

  it('stores a dailyReport assessment', async () => {
    const date = new Date('2026-06-03T00:00:00Z')
    await generateDailyReport('conflict-ua', 'Ukraine', date, sampleEvents)
    expect(mockAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'dailyReport',
        region: 'conflict-ua',
        body: 'Heavy fighting reported in eastern regions.',
        usedEventIds: ['evt-1'],
      }),
    })
  })

  it('does not call Claude when events array is empty', async () => {
    await generateDailyReport('conflict-ua', 'Ukraine', new Date(), [])
    expect(mockMessagesCreate).not.toHaveBeenCalled()
    expect(mockAssessmentCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm --filter worker test src/ai/assessor.test.ts
```

Expected: FAIL — `Cannot find module './assessor.js'`

- [ ] **Step 3: Implement `assessor.ts`**

Create `apps/worker/src/ai/assessor.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@conflictwatch/db'

const client = new Anthropic()

const SYSTEM_PROMPT =
  `You are a conflict intelligence analyst. Analyze conflict events and provide concise, ` +
  `factual assessments. Focus on observable patterns. Do not speculate beyond what the data supports.`

interface EventSummary {
  id: string
  title: string
  eventType: string
  confidence: string
  publishedAt: Date
  region: string
}

function deriveConfidence(events: EventSummary[]): 'low' | 'medium' | 'high' {
  if (events.some(e => e.confidence === 'high')) return 'high'
  if (events.some(e => e.confidence === 'medium')) return 'medium'
  return 'low'
}

export async function generatePrediction(
  conflictId: string,
  conflictName: string,
  events: EventSummary[]
): Promise<void> {
  if (events.length === 0) return

  const userPrompt =
    `Analyze these conflict events from ${conflictName} (last 24 hours) and provide a ` +
    `2-3 sentence escalation/de-escalation outlook.\n\nEvents:\n` +
    events
      .map(e => `- [${e.eventType}] ${e.title} (${e.publishedAt.toISOString().slice(0, 10)})`)
      .join('\n') +
    `\n\nRespond with ONLY the outlook text. No headers or formatting.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const body = response.content[0]?.type === 'text' ? response.content[0].text : ''

  await prisma.assessment.create({
    data: {
      region: conflictId,
      kind: 'prediction',
      body,
      confidence: deriveConfidence(events),
      usedEventIds: events.map(e => e.id),
    },
  })
}

export async function generateDailyReport(
  conflictId: string,
  conflictName: string,
  date: Date,
  events: EventSummary[]
): Promise<void> {
  if (events.length === 0) return

  const dateStr = date.toISOString().slice(0, 10)
  const userPrompt =
    `Summarize the following conflict events from ${conflictName} on ${dateStr}.\n\n` +
    `Events (${events.length} total):\n` +
    events.map(e => `- [${e.eventType}] ${e.title}`).join('\n') +
    `\n\nProvide a 3-4 sentence intelligence summary covering key developments. ` +
    `Respond with ONLY the summary text.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const body = response.content[0]?.type === 'text' ? response.content[0].text : ''

  await prisma.assessment.create({
    data: {
      region: conflictId,
      kind: 'dailyReport',
      body,
      confidence: deriveConfidence(events),
      usedEventIds: events.map(e => e.id),
    },
  })
}

export async function runHourlyAssessments(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const conflicts = await prisma.conflict.findMany({
    where: { status: 'active' },
    include: {
      events: {
        where: { publishedAt: { gte: cutoff } },
        select: {
          id: true,
          title: true,
          eventType: true,
          confidence: true,
          publishedAt: true,
          region: true,
        },
      },
    },
  })
  for (const conflict of conflicts) {
    if (conflict.events.length === 0) continue
    await generatePrediction(conflict.id, conflict.name, conflict.events)
  }
}

export async function runDailyReports(): Promise<void> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  const conflicts = await prisma.conflict.findMany({
    where: { status: 'active' },
    include: {
      events: {
        where: { publishedAt: { gte: today, lt: tomorrow } },
        select: {
          id: true,
          title: true,
          eventType: true,
          confidence: true,
          publishedAt: true,
          region: true,
        },
      },
    },
  })
  for (const conflict of conflicts) {
    if (conflict.events.length === 0) continue
    await generateDailyReport(conflict.id, conflict.name, today, conflict.events)
  }
}

export async function triggerAssessmentForConflict(conflictId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const conflict = await prisma.conflict.findUnique({
    where: { id: conflictId },
    include: {
      events: {
        where: { publishedAt: { gte: cutoff } },
        select: {
          id: true,
          title: true,
          eventType: true,
          confidence: true,
          publishedAt: true,
          region: true,
        },
      },
    },
  })
  if (!conflict || conflict.events.length === 0) return
  await generatePrediction(conflict.id, conflict.name, conflict.events)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm --filter worker test src/ai/assessor.test.ts
```

Expected: PASS — 7 tests passing.

- [ ] **Step 5: Run full worker test suite**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm --filter worker test
```

Expected: all tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/worker/src/ai/ && git commit -m "feat: add Claude assessment generator with hourly predictions and daily reports"
```

---

## Task 3: Modify `persist.ts` to Return Threat-Jump Info

**Files:**
- Modify: `apps/worker/src/pipeline/persist.ts`
- Modify: `apps/worker/src/pipeline/persist.test.ts`

- [ ] **Step 1: Update tests first**

Replace the full contents of `apps/worker/src/pipeline/persist.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedEvent } from '../types.js'

const mockUpsert = vi.fn().mockResolvedValue({ id: 'event-cuid-1' })
const mockCreate = vi.fn().mockResolvedValue({})
const mockFindUnique = vi.fn().mockResolvedValue(null)

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    conflict: { upsert: mockUpsert, findUnique: mockFindUnique },
    event: { upsert: mockUpsert },
    eventSource: { create: mockCreate },
    heartbeat: { upsert: mockUpsert },
  },
}))

const { persistEvent, updateHeartbeat } = await import('./persist.js')

const sampleEvent: NormalizedEvent = {
  globalEventId: '1234567890',
  url: 'https://reuters.com/article',
  sourceName: 'Reuters',
  publishedAt: new Date('2024-06-01T12:00:00Z'),
  lat: 48.38,
  lng: 31.17,
  region: 'Kyiv, Ukraine',
  countryCode: 'UA',
  actor1Name: 'RUSSIA',
  actor2Name: 'UKRAINE',
  eventCode: '190',
  eventRootCode: '19',
  quadClass: '4',
  goldsteinScale: -10,
  avgTone: -4.5,
}

describe('persistEvent', () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({ id: 'event-cuid-1' })
    mockCreate.mockReset().mockResolvedValue({})
    mockFindUnique.mockReset().mockResolvedValue(null)
  })

  it('upserts a Conflict record keyed by countryCode', async () => {
    await persistEvent(sampleEvent, ['Reuters'])
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conflict-ua' },
      })
    )
  })

  it('upserts an Event with clusterId = globalEventId', async () => {
    await persistEvent(sampleEvent, ['Reuters'])
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clusterId: '1234567890' },
      })
    )
  })

  it('returns threatLevelJumped=false when no existing conflict', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await persistEvent(sampleEvent, ['Reuters'])
    expect(result.threatLevelJumped).toBe(false)
  })

  it('returns threatLevelJumped=false when threat change is <2', async () => {
    // sampleEvent quadClass '4' → threatLevel 5; existing is 4 — diff is 1
    mockFindUnique.mockResolvedValue({ threatLevel: 4 })
    const result = await persistEvent(sampleEvent, ['Reuters'])
    expect(result.threatLevelJumped).toBe(false)
  })

  it('returns threatLevelJumped=true when threat change is ≥2', async () => {
    // sampleEvent quadClass '4' → threatLevel 5; existing is 2 — diff is 3
    mockFindUnique.mockResolvedValue({ threatLevel: 2 })
    const result = await persistEvent(sampleEvent, ['Reuters'])
    expect(result.threatLevelJumped).toBe(true)
  })

  it('returns conflictId matching countryCode', async () => {
    const result = await persistEvent(sampleEvent, ['Reuters'])
    expect(result.conflictId).toBe('conflict-ua')
  })
})

describe('updateHeartbeat', () => {
  it('upserts heartbeat with id=1', async () => {
    await updateHeartbeat(3, 0)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        create: expect.objectContaining({ sourcesOk: 3, sourcesFailed: 0 }),
        update: expect.objectContaining({ sourcesOk: 3, sourcesFailed: 0 }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm --filter worker test src/pipeline/persist.test.ts
```

Expected: FAIL — new tests fail because `persistEvent` still returns `void` and doesn't call `findUnique`.

- [ ] **Step 3: Update `persist.ts`**

Replace the full contents of `apps/worker/src/pipeline/persist.ts`:

```typescript
import { prisma } from '@conflictwatch/db'
import { scoreThreat, toEventType, scoreConfidence } from './score.js'
import { buildTitle } from './normalize.js'
import type { NormalizedEvent } from '../types.js'

function conflictId(countryCode: string): string {
  return `conflict-${countryCode.toLowerCase()}`
}

export async function persistEvent(
  event: NormalizedEvent,
  allSourceNamesForCluster: string[]
): Promise<{ threatLevelJumped: boolean; conflictId: string }> {
  const threatLevel = scoreThreat(event.quadClass)
  const eventType = toEventType(event.eventRootCode)
  const confidence = scoreConfidence(allSourceNamesForCluster)
  const title = buildTitle(event.actor1Name, event.actor2Name, eventType, event.region)
  const cId = conflictId(event.countryCode)

  const existing = await prisma.conflict.findUnique({
    where: { id: cId },
    select: { threatLevel: true },
  })

  await prisma.conflict.upsert({
    where: { id: cId },
    create: {
      id: cId,
      name: event.region.split(',').pop()?.trim() ?? event.countryCode,
      region: event.countryCode,
      status: 'active',
      threatLevel,
      lat: event.lat,
      lng: event.lng,
    },
    update: {
      threatLevel,
      lat: event.lat,
      lng: event.lng,
      status: 'active',
    },
  })

  const eventRecord = await prisma.event.upsert({
    where: { clusterId: event.globalEventId },
    create: {
      clusterId: event.globalEventId,
      title,
      eventType,
      lat: event.lat,
      lng: event.lng,
      region: event.region,
      confidence,
      publishedAt: event.publishedAt,
      conflictId: cId,
    },
    update: { confidence },
  })

  await prisma.eventSource.create({
    data: {
      eventId: eventRecord.id,
      name: event.sourceName,
      url: event.url,
      publishedAt: event.publishedAt,
    },
  })

  const threatLevelJumped =
    existing !== null && Math.abs(existing.threatLevel - threatLevel) >= 2

  return { threatLevelJumped, conflictId: cId }
}

export async function updateHeartbeat(
  sourcesOk: number,
  sourcesFailed: number
): Promise<void> {
  await prisma.heartbeat.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      lastIngestedAt: new Date(),
      sourcesOk,
      sourcesFailed,
    },
    update: {
      lastIngestedAt: new Date(),
      sourcesOk,
      sourcesFailed,
    },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm --filter worker test src/pipeline/persist.test.ts
```

Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm --filter worker test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/worker/src/pipeline/persist.ts apps/worker/src/pipeline/persist.test.ts && git commit -m "feat: return threat-jump status from persistEvent"
```

---

## Task 4: Wire Assessor into Worker Scheduler

**Files:**
- Modify: `apps/worker/src/index.ts`

No unit tests for `index.ts` (it's wiring/orchestration — tested by running the worker). Steps are TDD-lite: make the change, run TypeScript check, run existing tests.

- [ ] **Step 1: Replace `apps/worker/src/index.ts`**

```typescript
import 'dotenv/config'
import cron from 'node-cron'
import { GdeltSource } from './sources/gdelt.js'
import { isDuplicate, markSeen } from './pipeline/deduplicate.js'
import { persistEvent, updateHeartbeat } from './pipeline/persist.js'
import {
  runHourlyAssessments,
  runDailyReports,
  triggerAssessmentForConflict,
} from './ai/assessor.js'
import { redis } from './lib/redis.js'

const gdelt = new GdeltSource()

async function runIngestionCycle(): Promise<void> {
  const start = Date.now()
  let sourcesOk = 0
  let sourcesFailed = 0

  try {
    console.log(`[worker] ingestion cycle start`)
    const events = await gdelt.fetch()
    console.log(`[worker] fetched ${events.length} events from GDELT`)

    const clusterSources = new Map<string, string[]>()
    for (const event of events) {
      const names = clusterSources.get(event.globalEventId) ?? []
      names.push(event.sourceName)
      clusterSources.set(event.globalEventId, names)
    }

    const jumpedConflictIds = new Set<string>()
    let newCount = 0
    for (const event of events) {
      const dup = await isDuplicate(event.globalEventId, event.url)
      if (dup) continue

      const allSources = clusterSources.get(event.globalEventId) ?? [event.sourceName]
      const { threatLevelJumped, conflictId } = await persistEvent(event, allSources)
      await markSeen(event.globalEventId, event.url)
      newCount++
      if (threatLevelJumped) jumpedConflictIds.add(conflictId)
    }

    for (const cid of jumpedConflictIds) {
      await triggerAssessmentForConflict(cid).catch(err =>
        console.error(`[worker] threat-jump assessment failed for ${cid}:`, err)
      )
    }

    sourcesOk = 1
    console.log(`[worker] persisted ${newCount} new events in ${Date.now() - start}ms`)
  } catch (err) {
    sourcesFailed = 1
    console.error('[worker] ingestion error:', err)
  }

  await updateHeartbeat(sourcesOk, sourcesFailed)
}

async function main(): Promise<void> {
  await redis.connect()
  console.log('[worker] Redis connected')

  await runIngestionCycle()

  const ingestionTask = cron.schedule('*/5 * * * *', runIngestionCycle)
  const hourlyTask = cron.schedule('0 * * * *', () =>
    runHourlyAssessments().catch(err =>
      console.error('[worker] hourly assessment error:', err)
    )
  )
  const dailyTask = cron.schedule('0 0 * * *', () =>
    runDailyReports().catch(err =>
      console.error('[worker] daily report error:', err)
    )
  )
  console.log(
    '[worker] cron scheduled — polling every 5 min, assessments every hour, reports at midnight'
  )

  const shutdown = async () => {
    console.log('[worker] shutting down…')
    ingestionTask.stop()
    hourlyTask.stop()
    dailyTask.stop()
    await redis.disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch(err => {
  console.error('[worker] fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/worker && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/veikkakoskiranta/conflictwatch && pnpm --filter worker test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/worker/src/index.ts && git commit -m "feat: wire hourly/daily assessment crons and threat-jump trigger into worker"
```

---

## Task 5: `/api/predictions` Route

**Files:**
- Create: `apps/web/app/api/predictions/route.ts`

- [ ] **Step 1: Create route**

Create `apps/web/app/api/predictions/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET() {
  // 25-hour window ensures we catch assessments from the last full cycle
  const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000)

  const all = await prisma.assessment.findMany({
    where: { kind: 'prediction', createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
  })

  // Keep only the latest prediction per region
  const byRegion = new Map<string, (typeof all)[0]>()
  for (const assessment of all) {
    if (!byRegion.has(assessment.region)) {
      byRegion.set(assessment.region, assessment)
    }
  }

  return NextResponse.json({ predictions: [...byRegion.values()] })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/web && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Smoke test manually**

Start the dev server in one terminal:
```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/web && pnpm dev
```

In another terminal:
```bash
curl -s http://localhost:3000/api/predictions | head -c 200
```

Expected: `{"predictions":[]}` (empty array until worker has run and populated assessments — that is correct behavior).

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/web/app/api/predictions/ && git commit -m "feat: add /api/predictions route returning latest prediction per region"
```

---

## Task 6: `/api/report` Route

**Files:**
- Create: `apps/web/app/api/report/route.ts`

- [ ] **Step 1: Create route**

Create `apps/web/app/api/report/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'date param required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  const start = new Date(`${date}T00:00:00.000Z`)
  const end = new Date(`${date}T23:59:59.999Z`)

  const reports = await prisma.assessment.findMany({
    where: {
      kind: 'dailyReport',
      createdAt: { gte: start, lte: end },
    },
    orderBy: { region: 'asc' },
  })

  return NextResponse.json({ reports })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test**

Start dev server, then:
```bash
curl -s "http://localhost:3000/api/report?date=2026-06-03" | head -c 200
```
Expected: `{"reports":[]}` — correct, no data yet.

```bash
curl -s "http://localhost:3000/api/report" | head -c 100
```
Expected: `{"error":"date param required (YYYY-MM-DD)"}` with status 400.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/web/app/api/report/ && git commit -m "feat: add /api/report route returning daily report assessments by date"
```

---

## Task 7: `AssessmentCard` Component

**Files:**
- Create: `apps/web/app/predictions/components/AssessmentCard.tsx`

- [ ] **Step 1: Create component**

Create `apps/web/app/predictions/components/AssessmentCard.tsx`:

```tsx
interface AssessmentCardProps {
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

export default function AssessmentCard({
  region,
  body,
  confidence,
  createdAt,
  usedEventIds,
}: AssessmentCardProps) {
  return (
    <div className="border-l-2 border-amber-400 bg-[#111827] rounded-r-lg p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-amber-400 border border-amber-400 px-1.5 py-0.5 rounded">
          AI ASSESSMENT
        </span>
        <span className="text-xs font-mono text-gray-300">{region}</span>
        <span
          className={`text-xs font-mono border rounded px-1.5 py-0.5 ${
            CONFIDENCE_COLORS[confidence] ?? CONFIDENCE_COLORS.low
          }`}
        >
          {confidence}
        </span>
        <span className="text-xs font-mono text-gray-500 ml-auto">
          updated {new Date(createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-sm text-gray-200 leading-relaxed">{body}</p>
      {usedEventIds.length > 0 && (
        <p className="text-xs font-mono text-gray-600">
          Sources: {usedEventIds.join(', ')}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/web/app/predictions/components/ && git commit -m "feat: add AssessmentCard component with amber AI ASSESSMENT treatment"
```

---

## Task 8: `/predictions` Page

**Files:**
- Create: `apps/web/app/predictions/page.tsx`

- [ ] **Step 1: Create page**

Create `apps/web/app/predictions/page.tsx`:

```tsx
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
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test in browser**

```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/web && pnpm dev
```

Open `http://localhost:3000/predictions`. Expected: dark page with "PREDICTIONS" header, "No predictions available yet." message (correct — no data from worker yet). Nav shows ← MAP and INTEL FEED links. Stop dev server.

- [ ] **Step 4: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/web/app/predictions/page.tsx && git commit -m "feat: add /predictions page with AI assessment cards"
```

---

## Task 9: `/report` Page

**Files:**
- Create: `apps/web/app/report/page.tsx`

- [ ] **Step 1: Create page**

Create `apps/web/app/report/page.tsx`:

```tsx
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
  const [date, setDate] = useState(todayDateString)
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
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test in browser**

```bash
cd /Users/veikkakoskiranta/conflictwatch/apps/web && pnpm dev
```

Open `http://localhost:3000/report`. Expected: dark page with "DAILY REPORT" header, date picker defaulting to today, "No report available for this date." message. Change the date — loading state appears then "No report available" again (correct). Stop dev server.

- [ ] **Step 4: Commit**

```bash
cd /Users/veikkakoskiranta/conflictwatch && git add apps/web/app/report/ && git commit -m "feat: add /report page with date picker and per-region AI summaries"
```

---

## Self-Review Checklist

### Spec coverage
- ✅ Claude assessment generator in worker — Tasks 1–4
- ✅ `claude-sonnet-4-6` model — Task 2, `assessor.ts`
- ✅ Prompt caching (`cache_control: { type: 'ephemeral' }`) — Task 2
- ✅ Hourly cron for predictions — Task 4
- ✅ Daily cron for reports — Task 4
- ✅ Trigger on threatLevel change ≥2 — Tasks 3 + 4
- ✅ `Assessment` stored with `usedEventIds` — Task 2
- ✅ `GET /api/predictions` — Task 5
- ✅ `GET /api/report?date=` — Task 6
- ✅ `/predictions` page with amber border, AI ASSESSMENT label, confidence, timestamp, source event IDs — Tasks 7 + 8
- ✅ `/report` page with date picker, per-region sections — Task 9
- ✅ Visually distinct AI content (amber left border, "AI ASSESSMENT" label) — Tasks 7 + 8 + 9
- ✅ Every AI output stored with `usedEventIds` — no untraceable claims — Task 2
- ℹ️ `withTier("pro")` gating on `/api/predictions` and `/api/report` — deferred to Phase 4 (auth not yet built)
- ℹ️ Free-user locked state on `/predictions` — deferred to Phase 4

### Type consistency
- `EventSummary` interface defined once in `assessor.ts`, used by all four exported functions
- `AssessmentCard` props in `predictions/components/AssessmentCard.tsx` match the shape returned by `/api/predictions`
- `ReportSection` interface in `report/page.tsx` matches the shape returned by `/api/report`
- `persistEvent` return type `{ threatLevelJumped: boolean; conflictId: string }` consumed in `index.ts`

### No placeholders
None found — all steps contain complete implementation code.
