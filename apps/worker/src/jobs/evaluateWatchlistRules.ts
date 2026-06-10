import { prisma } from '@conflictwatch/db'
import { isSafeWebhookUrl } from '../lib/url-safety.js'

// Evaluate all enabled WatchlistRules and fire alerts where thresholds are met.
// Deduplicates: skips if an alert for this rule+conflict already fired within dedupWindowHours.
export async function evaluateWatchlistRules(): Promise<void> {
  const rules = await prisma.watchlistRule.findMany({
    where: { enabled: true },
    include: { user: { select: { id: true } } },
  })

  if (rules.length === 0) return

  for (const rule of rules) {
    await evaluateRule(rule)
  }
}

async function evaluateRule(rule: {
  id: string
  userId: string
  zoneFilter: string[]
  minPEscalation: number | null
  minSurpriseScore: number | null
  minThreatLevel: number | null
  webhookUrl: string | null
  slackWebhookUrl: string | null
  dedupWindowHours: number
}): Promise<void> {
  // Build conflict filter based on rule conditions
  const conflictWhere: Record<string, unknown> = {}
  if (rule.minThreatLevel !== null) conflictWhere['threatLevel'] = { gte: rule.minThreatLevel }

  const conflicts = await prisma.conflict.findMany({
    where: conflictWhere,
    select: { id: true, name: true, region: true, threatLevel: true },
  })

  for (const conflict of conflicts) {
    // Guard: verify threatLevel in-process (DB filter may be bypassed in tests/edge cases)
    if (rule.minThreatLevel !== null && conflict.threatLevel < rule.minThreatLevel) continue

    // Check zone filter: if zoneFilter is non-empty, conflict's region must match a zone
    if (rule.zoneFilter.length > 0) {
      const { inferZonesFromRegion } = await import('@conflictwatch/db')
      const zones = inferZonesFromRegion(conflict.region)
      if (!zones.some(z => rule.zoneFilter.includes(z))) continue
    }

    // Check pEscalation: latest signal for this conflict
    let pEscalation: number | null = null
    if (rule.minPEscalation !== null) {
      const latest = await prisma.escalationSignal.findFirst({
        where: { targetId: conflict.id },
        orderBy: { computedAt: 'desc' },
        select: { pEscalation: true },
      })
      pEscalation = latest?.pEscalation ?? null
      if (pEscalation === null || pEscalation < rule.minPEscalation) continue
    }

    // Check surpriseScore: any recent high-surprise event for this conflict
    let surpriseScore: number | null = null
    if (rule.minSurpriseScore !== null) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const surpriseEvent = await prisma.event.findFirst({
        where: {
          conflictId: conflict.id,
          surpriseScore: { gte: rule.minSurpriseScore },
          publishedAt: { gte: since },
        },
        orderBy: { surpriseScore: 'desc' },
        select: { surpriseScore: true },
      })
      if (!surpriseEvent) continue
      surpriseScore = surpriseEvent.surpriseScore
    }

    // Dedup: skip if this rule already fired for this conflict within dedupWindowHours
    const dedupCutoff = new Date(Date.now() - rule.dedupWindowHours * 60 * 60 * 1000)
    const existing = await prisma.alert.findFirst({
      where: { ruleId: rule.id, conflictId: conflict.id, createdAt: { gte: dedupCutoff } },
    })
    if (existing) continue

    // Fire alert
    const payload = {
      conflictId: conflict.id,
      conflictName: conflict.name,
      region: conflict.region,
      threatLevel: conflict.threatLevel,
      pEscalation,
      surpriseScore,
      triggeredAt: new Date().toISOString(),
      ruleId: rule.id,
    }

    const alert = await prisma.alert.create({
      data: {
        ruleId: rule.id,
        conflictId: conflict.id,
        pEscalation: pEscalation ?? undefined,
        surpriseScore: surpriseScore ?? undefined,
        threatLevel: conflict.threatLevel,
        payload,
      },
    })

    // Deliver
    await deliverAlert(alert.id, payload, rule)
  }
}

async function deliverAlert(
  alertId: string,
  payload: object,
  rule: { webhookUrl: string | null; slackWebhookUrl: string | null },
): Promise<void> {
  const deliveryErrors: string[] = []

  if (rule.webhookUrl && !isSafeWebhookUrl(rule.webhookUrl)) {
    deliveryErrors.push('webhook: URL rejected (https to a public host required)')
    rule = { ...rule, webhookUrl: null }
  }
  if (rule.slackWebhookUrl && !isSafeWebhookUrl(rule.slackWebhookUrl)) {
    deliveryErrors.push('slack: URL rejected (https to a public host required)')
    rule = { ...rule, slackWebhookUrl: null }
  }

  if (rule.webhookUrl) {
    try {
      const res = await fetch(rule.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) deliveryErrors.push(`webhook: HTTP ${res.status}`)
    } catch (err) {
      deliveryErrors.push(`webhook: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (rule.slackWebhookUrl) {
    try {
      const slackBody = {
        text: `*ConflictWatch Alert*`,
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${(payload as Record<string, unknown>).conflictName}* (${(payload as Record<string, unknown>).region})\n` +
              `Threat level: ${(payload as Record<string, unknown>).threatLevel} | ` +
              `P(escalation): ${(payload as Record<string, unknown>).pEscalation ?? '—'}`,
          },
        }],
      }
      const res = await fetch(rule.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackBody),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) deliveryErrors.push(`slack: HTTP ${res.status}`)
    } catch (err) {
      deliveryErrors.push(`slack: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (deliveryErrors.length === 0) {
    await prisma.alert.update({ where: { id: alertId }, data: { deliveredAt: new Date() } })
  } else {
    await prisma.alert.update({ where: { id: alertId }, data: { deliveryError: deliveryErrors.join('; ') } })
    console.error(`[watchlist] delivery failed for alert ${alertId}: ${deliveryErrors.join('; ')}`)
  }
}
