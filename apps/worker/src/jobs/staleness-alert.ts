import { prisma } from '@conflictwatch/db'

// Self-monitoring: if ingestion has not written a heartbeat within the
// threshold, fire the ops webhook (OPS_ALERT_WEBHOOK_URL). The UI already
// shows STALE; this makes staleness loud instead of waiting for someone to
// look at the screen. At most one alert per cooldown window per process.

const ALERT_COOLDOWN_MS = 60 * 60 * 1000

let lastAlertedAt = 0

// Test hook — resets the per-process cooldown state.
export function _resetAlertState(): void {
  lastAlertedAt = 0
}

export async function checkStaleness(thresholdMinutes: number): Promise<boolean> {
  const heartbeat = await prisma.heartbeat.findUnique({ where: { id: 1 } })

  const lastIngestedAt = heartbeat?.lastIngestedAt ?? null
  const ageMs = lastIngestedAt ? Date.now() - lastIngestedAt.getTime() : Infinity
  if (ageMs <= thresholdMinutes * 60 * 1000) return false

  if (Date.now() - lastAlertedAt < ALERT_COOLDOWN_MS) return false

  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL
  const ageLabel = lastIngestedAt
    ? `${Math.round(ageMs / 60000)} minutes ago`
    : 'never'
  console.error(`[staleness] ingestion heartbeat is stale — last ingest ${ageLabel}`)

  if (!webhookUrl) return false

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert: 'ingestion-stale',
        lastIngestedAt: lastIngestedAt?.toISOString() ?? null,
        thresholdMinutes,
        firedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    lastAlertedAt = Date.now()
    return true
  } catch (err) {
    console.error('[staleness] ops webhook delivery failed:', err)
    return false
  }
}
