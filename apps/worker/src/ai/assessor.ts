import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@conflictwatch/db'

const client = new Anthropic()

// Cost doctrine: Haiku for all narrative generation. The numbers come from
// the deterministic model; the LLM only writes language.
const MODEL = 'claude-haiku-4-5-20251001'

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
    model: MODEL,
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' } as const,
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const body = response.content[0]?.type === 'text' ? response.content[0].text : ''
  if (!body) return

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
    model: MODEL,
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' } as const,
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const body = response.content[0]?.type === 'text' ? response.content[0].text : ''
  if (!body) return

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

// Single-sentence situation line for a country — uses Haiku to keep cost low.
// Updates Conflict.currentSituationLine directly. Max 200 chars.
export async function generateSituationLine(
  conflictId: string,
  conflictName: string,
  events: EventSummary[],
): Promise<void> {
  if (events.length === 0) return

  const userPrompt =
    `In ONE sentence (max 200 characters), describe the current conflict situation in ${conflictName} ` +
    `based on these recent events:\n` +
    events.slice(0, 10).map(e => `- ${e.title}`).join('\n') +
    `\n\nRespond with ONLY the sentence. No punctuation at the end beyond a period.`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 100,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } as const }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  if (!raw) return

  const line = raw.slice(0, 200)

  await prisma.conflict.update({
    where: { id: conflictId },
    data: { currentSituationLine: line },
  })
}

// Change gate: an assessment is regenerated only when the conflict has an
// event the previous assessment did not use. Re-assessing the same evidence
// hourly is pure cost with zero new information.
export function hasNewEvents(currentEventIds: string[], lastUsedEventIds: string[] | null): boolean {
  if (!lastUsedEventIds) return true
  const used = new Set(lastUsedEventIds)
  return currentEventIds.some(id => !used.has(id))
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

    const lastAssessment = await prisma.assessment.findFirst({
      where: { region: conflict.id, kind: 'prediction' },
      orderBy: { createdAt: 'desc' },
      select: { usedEventIds: true },
    })
    if (!hasNewEvents(conflict.events.map(e => e.id), lastAssessment?.usedEventIds ?? null)) {
      continue
    }

    await generatePrediction(conflict.id, conflict.name, conflict.events)
    await generateSituationLine(conflict.id, conflict.name, conflict.events)
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
  await generateSituationLine(conflict.id, conflict.name, conflict.events)
}
