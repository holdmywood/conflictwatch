// Incremental UCDP poll — keeps the curated layer current going forward.
//
// Runs on a low cadence (weekly; UCDP Candidate updates ~monthly). Pulls the
// current-year Candidate dataset, maps it directly (ZERO tokens — no classifier
// import here), dedups against recent GDELT, upserts idempotently, and
// recomputes threat for any touched conflict. GDELT still provides real-time;
// this just keeps the multi-month historical depth fresh.

import {
  streamUcdpEvents,
  resolveCandidateCsvUrls,
  type CuratedEvent,
} from '../sources/ucdp.js'
import { persistCuratedEvent, recomputeConflictThreat, conflictId } from './persist.js'
import { findGdeltNearDuplicate } from './deduplicate.js'

const POLL_WINDOW_MS = 90 * 24 * 3600 * 1000 // candidate covers the current year; cap work
const DEDUP_WINDOW_MS = 30 * 24 * 3600 * 1000 // only here can GDELT actually overlap

export async function runUcdpPoll(): Promise<{ created: number; updated: number; deduped: number }> {
  const urls = process.env.UCDP_CANDIDATE_URL
    ? [process.env.UCDP_CANDIDATE_URL]
    : await resolveCandidateCsvUrls()

  // Merge all candidate files (latest coverage wins on duplicate ids).
  const byId = new Map<string, CuratedEvent>()
  const sinceMs = Date.now() - POLL_WINDOW_MS
  for (const url of urls) {
    try {
      for (const e of await streamUcdpEvents(url, sinceMs)) byId.set(e.clusterId, e)
    } catch (err) {
      console.warn(`[ucdp-poll] fetch failed for ${url}:`, (err as Error).message)
    }
  }

  const touched = new Set<string>()
  let created = 0, updated = 0, deduped = 0
  const nowMs = Date.now()

  for (const e of byId.values()) {
    try {
      if (nowMs - e.publishedAt.getTime() <= DEDUP_WINDOW_MS) {
        const dup = await findGdeltNearDuplicate({
          conflictId: conflictId(e.countryCode), lat: e.lat, lng: e.lng, publishedAt: e.publishedAt,
        })
        if (dup) { deduped++; continue }
      }
      const { conflictId: cId, created: wasCreated } = await persistCuratedEvent(e)
      if (wasCreated) created++; else updated++
      touched.add(cId)
    } catch (err) {
      console.error(`[ucdp-poll] event ${e.clusterId} skipped:`, (err as Error).message)
    }
  }

  for (const cId of touched) await recomputeConflictThreat(cId).catch(() => {})
  console.log(`[ucdp-poll] created=${created} updated=${updated} deduped=${deduped} conflicts=${touched.size}`)
  return { created, updated, deduped }
}
