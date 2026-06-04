/**
 * Backfill script: populate EpisodeStore from historical event data.
 *
 * Algorithm:
 *   1. Find all distinct conflictIds in the Event table.
 *   2. For each conflict, fetch all classified events sorted by publishedAt.
 *   3. Generate weekly snapshot dates from the earliest event up to today.
 *   4. For each snapshot date D:
 *      - Use only events with publishedAt <= D (point-in-time safe).
 *      - Window: events in [D - 7 days, D].
 *      - Skip if fewer than 3 events in window (not enough signal).
 *      - Skip if an EpisodeStore record already exists (idempotent).
 *      - Compute features using computeTrendFeatures.
 *      - Forward-look 14 days: did any event with severity >= 4 and
 *        medium/high confidence exist? That determines escalatedToNational.
 *      - Create EpisodeStore record.
 *   5. Print per-conflict progress and a final summary.
 *
 * Run:
 *   npx tsx apps/worker/scripts/backfill-episodes.ts
 *   node --loader tsx/esm apps/worker/scripts/backfill-episodes.ts
 */
import 'dotenv/config'
import { prisma } from '@conflictwatch/db'
import { computeTrendFeatures } from '../src/pipeline/escalation.js'

const WINDOW_DAYS = 7
const HORIZON_DAYS = 14
const MIN_WINDOW_EVENTS = 3
const MODEL_VERSION = 'backfill-v1'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = WINDOW_DAYS * DAY_MS

/**
 * Generate an array of weekly snapshot dates starting from startDate up to today.
 * Each date is aligned to a week boundary starting from startDate.
 */
function generateWeeklySnapshots(startDate: Date, endDate: Date): Date[] {
  const snapshots: Date[] = []
  let current = new Date(startDate.getTime())
  // Start from the first week boundary after the earliest event
  current = new Date(startDate.getTime() + WEEK_MS)
  while (current <= endDate) {
    snapshots.push(new Date(current.getTime()))
    current = new Date(current.getTime() + WEEK_MS)
  }
  return snapshots
}

async function main() {
  console.log('[backfill-episodes] Starting EpisodeStore backfill…')

  // Step 1: find all distinct conflictIds with classified events
  const conflictRows = await prisma.event.findMany({
    where: { classified: true, conflictId: { not: null } },
    select: { conflictId: true },
    distinct: ['conflictId'],
  })

  const conflictIds = conflictRows
    .map(r => r.conflictId)
    .filter((id): id is string => id !== null)

  console.log(`[backfill-episodes] Found ${conflictIds.length} conflicts with classified events`)

  const today = new Date()
  let totalCreated = 0
  let totalSkippedSignal = 0
  let totalSkippedExists = 0

  for (const conflictId of conflictIds) {
    try {
      // Step 2: fetch all classified events for this conflict, sorted by publishedAt
      const allEvents = await prisma.event.findMany({
        where: {
          conflictId,
          classified: true,
        },
        select: {
          id: true,
          severity: true,
          region: true,
          actor1: true,
          actor2: true,
          publishedAt: true,
          confidence: true,
          locationConfidence: true,
        },
        orderBy: { publishedAt: 'asc' },
      })

      if (allEvents.length === 0) continue

      const earliestEvent = allEvents[0]!
      const earliestDate = earliestEvent.publishedAt

      // Step 3: generate weekly snapshot dates
      const snapshotDates = generateWeeklySnapshots(earliestDate, today)
      if (snapshotDates.length === 0) continue

      let created = 0
      let skippedSignal = 0
      let skippedExists = 0

      for (const D of snapshotDates) {
        const windowStart = new Date(D.getTime() - WEEK_MS)
        const forwardEnd = new Date(D.getTime() + HORIZON_DAYS * DAY_MS)

        // STRICT: only use events where publishedAt <= D (point-in-time safe)
        const windowEvents = allEvents.filter(
          e => e.publishedAt >= windowStart && e.publishedAt <= D
        )

        // Step 4a: skip if fewer than MIN_WINDOW_EVENTS in window
        if (windowEvents.length < MIN_WINDOW_EVENTS) {
          skippedSignal++
          continue
        }

        // Step 4b: idempotency — skip if record already exists for this conflict + snapshotAt
        const existing = await prisma.episodeStore.findFirst({
          where: {
            conflictId,
            snapshotAt: D,
          },
          select: { id: true },
        })
        if (existing) {
          skippedExists++
          continue
        }

        // Step 4c: compute features (only uses windowEvents which are all <= D)
        const features = computeTrendFeatures(conflictId, windowEvents, WINDOW_DAYS)

        // Step 4d: forward-look for outcome (allowed — we're computing history)
        // Did any event with publishedAt in (D, D+14days] have severity >= 4
        // and confidence in ['medium', 'high']?
        const escalatedToNational = allEvents.some(
          e =>
            e.publishedAt > D &&
            e.publishedAt <= forwardEnd &&
            e.severity >= 4 &&
            (e.confidence === 'medium' || e.confidence === 'high')
        )

        // Step 4e: create EpisodeStore record
        await prisma.episodeStore.create({
          data: {
            conflictId,
            snapshotAt: D,
            eventTempo: features.eventTempo,
            severitySlope: features.severitySlope,
            spreadLocations: features.spreadLocations,
            sourceBreadth: 0, // not available for historical events
            actorCount: features.actorCount,
            geographyClass: '',
            actorTypes: [],
            chokepoints: [],
            commodityTags: [],
            escalatedToNational,
            escalationHorizonDays: HORIZON_DAYS,
            usedEventIds: windowEvents.map(e => e.id),
            modelVersion: MODEL_VERSION,
          },
        })

        created++
      }

      console.log(
        `[backfill-episodes] conflict ${conflictId}: ${created} snapshots created` +
          (skippedSignal > 0 ? `, ${skippedSignal} skipped (low signal)` : '') +
          (skippedExists > 0 ? `, ${skippedExists} skipped (already exists)` : '')
      )

      totalCreated += created
      totalSkippedSignal += skippedSignal
      totalSkippedExists += skippedExists
    } catch (err) {
      console.error(`[backfill-episodes] Error processing conflict ${conflictId}:`, err)
      // Continue with next conflict — one failure doesn't abort all
    }
  }

  console.log(
    `[backfill-episodes] Done. ` +
      `Total: ${totalCreated} created, ` +
      `${totalSkippedSignal} skipped (low signal), ` +
      `${totalSkippedExists} skipped (already exist)`
  )

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[backfill-episodes] Fatal:', err)
  process.exit(1)
})
