// Global historical backfill from UCDP — the ZERO-TOKEN path.
//
// Loads ~12 months of curated armed-conflict events for the ENTIRE dataset (no
// country target list) — finalized GED + current-year Candidate — and writes
// them straight to the DB. Countries appear automatically because they're in
// the data; nothing is named per-country in code. There is NO classifier import
// here, so it cannot spend Anthropic tokens.
//
// Streams + date-filters the 274 MB GED so it doesn't OOM, then bulk-writes
// (createMany, idempotent on `ucdp-<id>`). Cross-source dedup vs recent GDELT
// avoids double-counting. Re-running is safe (skipDuplicates).
//
//   BACKFILL_DAYS=365 DATABASE_URL="<prod>" pnpm --filter worker exec tsx src/ucdp-backfill.ts
//
// Optional: UCDP_GED_URL, UCDP_CANDIDATE_URL.

import 'dotenv/config'
import { prisma } from '@conflictwatch/db'
import {
  streamUcdpEvents,
  resolveCandidateCsvUrls,
  UCDP_GED_ZIP_URL,
  type CuratedEvent,
} from './sources/ucdp.js'
import { bulkPersistCurated, recomputeConflictThreat, conflictId } from './pipeline/persist.js'
import { findGdeltNearDuplicate } from './pipeline/deduplicate.js'

const DAYS = Number(process.env.BACKFILL_DAYS ?? 365)
const GED_URL = process.env.UCDP_GED_URL ?? UCDP_GED_ZIP_URL
const DEDUP_WINDOW_MS = 30 * 24 * 3600 * 1000

async function main(): Promise<void> {
  const dbHost = (process.env.DATABASE_URL ?? '').replace(/:[^:@/]*@/, ':***@').replace(/^.*@/, '')
  console.log(`[ucdp-backfill] target DB host: ${dbHost || '(unset!)'}`)
  const sinceMs = Date.now() - DAYS * 24 * 3600 * 1000

  const candidateUrls = process.env.UCDP_CANDIDATE_URL
    ? [process.env.UCDP_CANDIDATE_URL]
    : await resolveCandidateCsvUrls()
  console.log(`[ucdp-backfill] global pull, last ${DAYS}d | GED=${GED_URL} | candidates=${candidateUrls.length}`)

  // Stream + window-filter every source (keeps memory bounded on the 274MB GED).
  console.log('[ucdp-backfill] downloading + streaming datasets…')
  const sources = [GED_URL, ...candidateUrls]
  const byId = new Map<string, CuratedEvent>()
  for (const url of sources) {
    try {
      const evs = await streamUcdpEvents(url, sinceMs)
      for (const e of evs) byId.set(e.clusterId, e) // later sources (candidate) win on overlap
      console.log(`[ucdp-backfill]   ${evs.length} in-window events from ${url.split('/').pop()}`)
    } catch (err) {
      console.warn(`[ucdp-backfill]   fetch failed for ${url}: ${(err as Error).message}`)
    }
  }
  let events = [...byId.values()]
  const countries = new Set(events.map(e => e.countryCode))
  const estMin = Math.max(1, Math.round((events.length / 2000) * 0.5))
  console.log(`[ucdp-backfill] ${events.length} events across ${countries.size} countries — est. load ~${estMin} min`)

  // Cross-source dedup: only the recent overlap can collide with our ~1-week GDELT.
  const nowMs = Date.now()
  const recent = events.filter(e => nowMs - e.publishedAt.getTime() <= DEDUP_WINDOW_MS)
  const dupes = new Set<string>()
  for (const e of recent) {
    const dup = await findGdeltNearDuplicate({ conflictId: conflictId(e.countryCode), lat: e.lat, lng: e.lng, publishedAt: e.publishedAt }).catch(() => null)
    if (dup) dupes.add(e.clusterId)
  }
  if (dupes.size) {
    events = events.filter(e => !dupes.has(e.clusterId))
    console.log(`[ucdp-backfill] dropped ${dupes.size} GDELT-duplicate events`)
  }

  console.log('[ucdp-backfill] bulk-writing…')
  const { created, conflicts } = await bulkPersistCurated(events)
  console.log(`[ucdp-backfill] wrote ${created} new events across ${conflicts.size} conflicts`)

  console.log(`[ucdp-backfill] recomputing threat for ${conflicts.size} conflicts…`)
  for (const cId of conflicts) {
    await recomputeConflictThreat(cId).catch(err => console.error(`[ucdp-backfill] recompute ${cId}:`, (err as Error).message))
  }

  console.log(`[ucdp-backfill] DONE — events=${events.length} created=${created} conflicts=${conflicts.size} countries=${countries.size}`)
  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[ucdp-backfill] fatal:', err)
  process.exit(1)
})
