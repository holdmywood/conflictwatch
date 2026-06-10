import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'
import Anthropic from '@anthropic-ai/sdk'
import { rateLimit, clientKey } from '../../../../lib/rate-limit'

const client = new Anthropic()

// This route spends LLM budget on a cache miss — bound it per client and globally.
const PER_CLIENT_LIMIT = 10   // per minute
const GLOBAL_LIMIT = 60       // per minute, all clients
const WINDOW_MS = 60_000

const SYSTEM_PROMPT =
  `You are a conflict intelligence analyst. Summarize the key facts from this article in 3-4 sentences. ` +
  `Focus on who, what, where, and what it means for regional stability. Be factual, not speculative.`

async function fetchArticleText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConflictWatch/1.0)' },
    })
    if (!res.ok) return null
    const html = await res.text()
    // Strip tags for a rough plain-text extraction (no jsdom in web app)
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)
  } catch {
    return null
  }
}

async function summarizeWithHaiku(articleText: string, eventTitle: string): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } as const }],
      messages: [{
        role: 'user',
        content: `Article title: ${eventTitle}\n\nArticle text:\n${articleText}\n\nProvide a 3-4 sentence summary. Respond with ONLY the summary text.`,
      }],
    })
    const text = response.content[0]?.type === 'text' ? response.content[0].text : null
    return text || null
  } catch {
    return null
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const perClient = rateLimit(`summary:${clientKey(request)}`, PER_CLIENT_LIMIT, WINDOW_MS)
  const global = rateLimit('summary:global', GLOBAL_LIMIT, WINDOW_MS)
  if (!perClient.allowed || !global.allowed) {
    const retryAfter = Math.max(perClient.retryAfterSeconds, global.retryAfterSeconds)
    return NextResponse.json(
      { error: 'Rate limit exceeded. Retry shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      summary: true,
      summarized: true,
      sources: { select: { url: true }, take: 3 },
    },
  })

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Return cached summary if already generated
  if (event.summarized && event.summary) {
    return NextResponse.json({ summary: event.summary, cached: true })
  }

  // Try each source URL until we get article text
  let articleText: string | null = null
  for (const source of event.sources) {
    articleText = await fetchArticleText(source.url)
    if (articleText) break
  }

  if (!articleText) {
    return NextResponse.json({ error: 'Could not fetch article text' }, { status: 502 })
  }

  const summary = await summarizeWithHaiku(articleText, event.title)
  if (!summary) {
    return NextResponse.json({ error: 'Summary generation failed' }, { status: 502 })
  }

  await prisma.event.update({
    where: { id },
    data: { summary, summarized: true },
  })

  return NextResponse.json({ summary, cached: false })
}
