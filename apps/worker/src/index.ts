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
