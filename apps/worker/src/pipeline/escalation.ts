import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@conflictwatch/db'
import { snapshotEpisode, logCalibration } from '../ai/episode-logger.js'
import { computePEscalation } from '../ai/probability-model.js'
import { computeSourceBreadth } from './score.js'

const client = new Anthropic()

const SYSTEM_PROMPT =
  `You are a conflict escalation analyst. Based on trend data, assess the risk of ` +
  `national-level escalation. Be calibrated — most conflicts de-escalate. ` +
  `Only mark 'high' when there are strong multi-source indicators of imminent state-level action.`

// Minimum corroborated events in the window before running escalation pass.
// Below this threshold there is not enough signal to assess.
const MIN_EVENTS_FOR_PASS = 5

// Cooldown: do not emit a new signal for the same conflict within 6 hours.
const COOLDOWN_MS = 6 * 60 * 60 * 1000

export interface TrendFeatures {
  conflictId: string
  eventTempo: number
  severitySlope: number
  spreadLocations: number
  sourceBreadth: number
  actorCount: number
}

interface WindowEvent {
  id: string
  severity: number
  region: string
  actor1: string | null
  actor2: string | null
  publishedAt: Date
  confidence: string
  locationConfidence: string
}

// Compute trend features over the given window (windowDays days back from now).
export function computeTrendFeatures(
  conflictId: string,
  events: WindowEvent[],
  windowDays: number,
): TrendFeatures {
  if (events.length === 0) {
    return { conflictId, eventTempo: 0, severitySlope: 0, spreadLocations: 0, sourceBreadth: 0, actorCount: 0 }
  }

  const eventTempo = events.length / windowDays

  // Severity slope: compare avg severity of first half vs second half
  const sorted = [...events].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
  const mid = Math.floor(sorted.length / 2)
  const avgFirst = sorted.slice(0, mid).reduce((s, e) => s + e.severity, 0) / (mid || 1)
  const avgSecond = sorted.slice(mid).reduce((s, e) => s + e.severity, 0) / (sorted.length - mid || 1)
  const severitySlope = avgSecond - avgFirst

  const spreadLocations = new Set(events.map(e => e.region)).size

  const actors = new Set<string>()
  for (const e of events) {
    if (e.actor1) actors.add(e.actor1)
    if (e.actor2) actors.add(e.actor2)
  }

  return {
    conflictId,
    eventTempo: Math.round(eventTempo * 10) / 10,
    severitySlope: Math.round(severitySlope * 10) / 10,
    spreadLocations,
    sourceBreadth: 0, // computed from EventSource rows in runEscalationPass
    actorCount: actors.size,
  }
}

interface EscalationAssessment {
  escalationRisk: 'none' | 'watch' | 'elevated' | 'high'
  trajectory: string
  drivers: string[]
  actorsOfConcern: string[]
  horizon: string
  rationale: string
}

function parseAssessment(text: string): EscalationAssessment | null {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed.escalationRisk) return null
    return parsed as EscalationAssessment
  } catch {
    return null
  }
}

// Run the escalation pass for a single conflict.
// Returns the signal ID if a signal was created, or null.
export async function runEscalationPass(conflictId: string): Promise<string | null> {
  // Cooldown check
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS)
  const recent = await prisma.escalationSignal.findFirst({
    where: { targetId: conflictId, computedAt: { gte: cooldownCutoff } },
  })
  if (recent) return null

  // Fetch events from 7-day window
  const windowMs = 7 * 24 * 60 * 60 * 1000
  const windowStart = new Date(Date.now() - windowMs)
  const events = await prisma.event.findMany({
    where: {
      conflictId,
      publishedAt: { gte: windowStart },
      classified: true,
      confidence: { in: ['medium', 'high'] },
      locationConfidence: { not: 'low' },
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
  })

  if (events.length < MIN_EVENTS_FOR_PASS) return null

  const features = computeTrendFeatures(conflictId, events, 7)

  // Real independent-source breadth across the window's events
  // (wire syndication collapsed). Part of the signal's provenance —
  // must reflect what was actually computed, never a placeholder.
  const windowSources = await prisma.eventSource.findMany({
    where: { eventId: { in: events.map(e => e.id) } },
    select: { name: true },
  })
  features.sourceBreadth = computeSourceBreadth(windowSources.map(s => s.name))

  const userPrompt =
    `Conflict ID: ${conflictId}\n` +
    `Window: last 7 days\n` +
    `Event tempo: ${features.eventTempo} events/day\n` +
    `Severity slope: ${features.severitySlope > 0 ? '+' : ''}${features.severitySlope} (rising = positive)\n` +
    `Spread locations: ${features.spreadLocations}\n` +
    `Active actors: ${features.actorCount}\n\n` +
    `Recent event titles (up to 10):\n` +
    events.slice(0, 10).map(e => `- [sev ${e.severity}] ${e.region}`).join('\n') +
    `\n\nRespond with JSON only:\n` +
    `{"escalationRisk":"none|watch|elevated|high","trajectory":"string","drivers":["..."],` +
    `"actorsOfConcern":["..."],"horizon":"string","rationale":"string"}`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } as const }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const assessment = parseAssessment(text)
  if (!assessment) return null

  const { p, ciLow, ciHigh, modelVersion } = computePEscalation(features)
  const horizonDays = 14

  // Snapshot episode before creating signal
  const episodeId = await snapshotEpisode({
    conflictId,
    eventTempo: features.eventTempo,
    severitySlope: features.severitySlope,
    spreadLocations: features.spreadLocations,
    sourceBreadth: features.sourceBreadth,
    actorCount: features.actorCount,
    geographyClass: '',
    actorTypes: [],
    chokepoints: [],
    commodityTags: [],
    usedEventIds: events.map(e => e.id),
  })

  const signal = await prisma.escalationSignal.create({
    data: {
      scope: 'country',
      targetId: conflictId,
      escalationRisk: assessment.escalationRisk,
      trajectory: assessment.trajectory,
      drivers: assessment.drivers,
      actorsOfConcern: assessment.actorsOfConcern,
      horizon: assessment.horizon,
      rationale: assessment.rationale,
      confidence: 'medium',
      usedEventIds: events.map(e => e.id),
      triggeringFeatures: features as object,
      pEscalation: p,
      ciLow,
      ciHigh,
      horizonDays,
      modelVersion,
      episodeId,
    },
  })

  await logCalibration(signal.id, p, ciLow, ciHigh, horizonDays, modelVersion)

  return signal.id
}

// Run escalation pass for all active conflicts with sufficient recent events.
// Intended for the hourly cron.
export async function runAllEscalationPasses(): Promise<void> {
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const conflicts = await prisma.event.findMany({
    where: { publishedAt: { gte: windowStart }, classified: true },
    select: { conflictId: true },
    distinct: ['conflictId'],
  })

  for (const { conflictId } of conflicts) {
    if (!conflictId) continue
    await runEscalationPass(conflictId).catch(err =>
      console.error(`[escalation] pass failed for ${conflictId}:`, err)
    )
  }
}
