// One-time historical backfill from UCDP — the ZERO-TOKEN path.
//
// Loads ~12 months of curated armed-conflict events from UCDP (finalized GED +
// current-year Candidate) and writes them straight to the DB with fields
// derived from the dataset's own structure. There is NO classifier import in
// this file, so it is impossible for it to spend Anthropic tokens — that is the
// whole point: curated data needs no AI cleanup.
//
// Idempotent (upsert on `ucdp-<id>`) and resumable (a checkpoint file records
// progress, so a crash continues instead of restarting). Cross-source dedup
// against recent GDELT prevents double-counting the same incident.
//
//   BACKFILL_DAYS=365 DATABASE_URL="<prod>" pnpm --filter worker exec tsx src/ucdp-backfill.ts
//
// Optional env: UCDP_GED_URL, UCDP_CANDIDATE_URL, BACKFILL_LIMIT (cap events,
// for a test slice), UCDP_CHECKPOINT (checkpoint file path).

import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { prisma } from '@conflictwatch/db'
import {
  fetchUcdpEvents,
  UCDP_GED_ZIP_URL,
  UCDP_CANDIDATE_CSV_URL,
  type CuratedEvent,
} from './sources/ucdp.js'
import { persistCuratedEvent, recomputeConflictThreat, conflictId } from './pipeline/persist.js'
import { findGdeltNearDuplicate } from './pipeline/deduplicate.js'

const DAYS = Number(process.env.BACKFILL_DAYS ?? 365)
const LIMIT = process.env.BACKFILL_LIMIT ? Number(process.env.BACKFILL_LIMIT) : Infinity
const GED_URL = process.env.UCDP_GED_URL ?? UCDP_GED_ZIP_URL
const CANDIDATE_URL = process.env.UCDP_CANDIDATE_URL ?? UCDP_CANDIDATE_CSV_URL
const CHECKPOINT = process.env.UCDP_CHECKPOINT ?? '.ucdp-backfill.checkpoint.json'

// Only the recent overlap window can collide with our ~1-week GDELT data;
// older curated events can't, so we skip the dedup query for them (cheaper).
const DEDUP_WINDOW_MS = 30 * 24 * 3600 * 1000

const TRANSIENT_DB_CODES = new Set(['P2024', 'P1001', 'P1017'])
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!TRANSIENT_DB_CODES.has((err as { code?: string }).code ?? '')) throw err
      await new Promise(r => setTimeout(r, 250 * (i + 1)))
    }
  }
  throw lastErr
}

function loadCheckpoint(): number {
  if (!existsSync(CHECKPOINT)) return 0
  try {
    return Number(JSON.parse(readFileSync(CHECKPOINT, 'utf8')).index ?? 0) || 0
  } catch {
    return 0
  }
}
function saveCheckpoint(index: number): void {
  writeFileSync(CHECKPOINT, JSON.stringify({ index, savedAt: new Date().toISOString() }))
}

async function main(): Promise<void> {
  const dbHost = (process.env.DATABASE_URL ?? '').replace(/:[^:@/]*@/, ':***@').replace(/^.*@/, '')
  console.log(`[ucdp-backfill] target DB host: ${dbHost || '(unset!)'}`)
  console.log(`[ucdp-backfill] days=${DAYS} ged=${GED_URL} candidate=${CANDIDATE_URL}`)

  const cutoff = new Date(Date.now() - DAYS * 24 * 3600 * 1000)
  const nowMs = Date.now()

  // Download + parse both products (zero tokens), filter to the window, merge.
  console.log('[ucdp-backfill] downloading datasets…')
  const [ged, candidate] = await Promise.all([
    fetchUcdpEvents(GED_URL).catch(err => {
      console.warn('[ucdp-backfill] GED fetch failed (continuing with candidate):', (err as Error).message)
      return [] as CuratedEvent[]
    }),
    fetchUcdpEvents(CANDIDATE_URL).catch(err => {
      console.warn('[ucdp-backfill] candidate fetch failed (continuing with GED):', (err as Error).message)
      return [] as CuratedEvent[]
    }),
  ])

  const byId = new Map<string, CuratedEvent>()
  for (const e of [...ged, ...candidate]) {
    if (e.publishedAt >= cutoff) byId.set(e.clusterId, e) // candidate (later) wins on overlap
  }
  // Newest-first, so threat climbs visibly and a partial run still covers recent history.
  const events = [...byId.values()].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  console.log(`[ucdp-backfill] ${events.length} events within ${DAYS}d (ged=${ged.length} candidate=${candidate.length})`)

  let start = loadCheckpoint()
  if (start > 0) console.log(`[ucdp-backfill] resuming from checkpoint index ${start}`)

  const touched = new Set<string>()
  let created = 0
  let updated = 0
  let deduped = 0
  let processed = 0

  for (let i = start; i < events.length && processed < LIMIT; i++) {
    const e = events[i]
    try {
      // Cross-source dedup only where GDELT could actually overlap.
      if (nowMs - e.publishedAt.getTime() <= DEDUP_WINDOW_MS) {
        const dup = await withRetry(() =>
          findGdeltNearDuplicate({ conflictId: conflictId(e.countryCode), lat: e.lat, lng: e.lng, publishedAt: e.publishedAt }),
        )
        if (dup) {
          deduped++
          continue
        }
      }

      const { conflictId: cId, created: wasCreated } = await withRetry(() => persistCuratedEvent(e))
      if (wasCreated) created++
      else updated++
      touched.add(cId)
    } catch (err) {
      console.error(`[ucdp-backfill] event ${e.clusterId} skipped:`, (err as Error).message)
    }

    processed++
    if (processed % 500 === 0) {
      saveCheckpoint(i + 1)
      // Recompute threat periodically so levels rise during the run.
      for (const cId of touched) await recomputeConflictThreat(cId).catch(() => {})
      console.log(
        `[ucdp-backfill] processed=${processed} created=${created} updated=${updated} deduped=${deduped} conflicts=${touched.size}`,
      )
    }
  }

  console.log(`[ucdp-backfill] recomputing threat for ${touched.size} conflicts…`)
  for (const cId of touched) {
    await recomputeConflictThreat(cId).catch(err =>
      console.error(`[ucdp-backfill] threat recompute failed for ${cId}:`, (err as Error).message),
    )
  }

  saveCheckpoint(Math.min(start + processed, events.length))
  console.log(
    `[ucdp-backfill] DONE — processed=${processed} created=${created} updated=${updated} deduped=${deduped} conflicts=${touched.size}`,
  )
  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[ucdp-backfill] fatal:', err)
  process.exit(1)
})
