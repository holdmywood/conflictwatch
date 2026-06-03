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
    model: 'claude-sonnet-4-6',
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
