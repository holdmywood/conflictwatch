import Anthropic from '@anthropic-ai/sdk'
import type { LeadText } from '../pipeline/fetcher.js'

const client = new Anthropic()
const MODEL = 'claude-haiku-4-5-20251001'

// ── Output contract ───────────────────────────────────────────────────────────

export type EventCategory =
  | 'armed-conflict'
  | 'terrorism'
  | 'insurgency'
  | 'civil-unrest'
  | 'state-violence'
  | 'political-instability'
  | 'other'

export type Significance = 'local-isolated' | 'notable' | 'nationally-significant' | 'severe'
export type LocationConfidence = 'high' | 'medium' | 'low'

export interface ClassifyResult {
  include: boolean
  exclude_reason: string | null
  category: EventCategory
  significance: Significance
  severity: number          // 1–5
  stability_impact: string  // one line or 'none'
  title: string             // ≤90 chars, factual, neutral
  actors: string[]          // real named parties only; [] if unclear
  location_confidence: LocationConfidence
}

// ── System prompt (prompt-cached across calls) ─────────────────────────────
// The full §2/§3 classify spec lives here. Rules are explicit and include
// verbatim anchor examples to pin calibration.

const SYSTEM_PROMPT = `You are a conflict-intelligence classifier for a professional market-intelligence terminal. Your output feeds analysts who make financial decisions. Overclaiming costs them money and their trust permanently. Underclaiming hides genuine signals.

## Task
Classify a news article (headline + lead paragraph) as: include (material conflict signal) or exclude (noise).

## Output format
Respond with ONLY valid JSON matching this schema exactly. No prose, no markdown fences.
{
  "include": boolean,
  "exclude_reason": string | null,
  "category": "armed-conflict"|"terrorism"|"insurgency"|"civil-unrest"|"state-violence"|"political-instability"|"other",
  "significance": "local-isolated"|"notable"|"nationally-significant"|"severe",
  "severity": 1|2|3|4|5,
  "stability_impact": "<one line: why it matters or plausible further consequences, or 'none'>",
  "title": "<concise factual neutral headline, max 90 chars>",
  "actors": ["<real named parties only; [] if unclear>"],
  "location_confidence": "high"|"medium"|"low"
}

## Include rules
INCLUDE only if the event is material to conflict or national stability:
- Scale: mass casualties, many participants, large military formations
- Institutional: military/state security/government as a party to violence
- Escalation/spread: protests turning violent, spreading unrest, clashes with authorities
- Continuity: part of an ongoing armed conflict (new front, offensive, shelling campaign)
- Destabilization: article-supported evidence this could destabilize governance, territory, or critical infrastructure

## Exclude rules → include=false
Set exclude_reason explaining which rule applies.
- Local crime: lone arrest, ordinary policing, one isolated assault with no fallout
- Ordinary politics: elections, peaceful protest, parliamentary debate, policy disputes
- Business: finance, mining, commodities markets, M&A, earnings, product launches, sport
- Accidents/weather/natural disasters (unless causing secondary armed conflict)
- Pure speculation or op-ed with no concrete events
- "other" category articles always excluded

## Significance calibration
- local-isolated: one incident, contained, no stated wider impact → EXCLUDE
- notable: multi-incident or named institutional actor, limited fallout
- nationally-significant: multi-day, widespread, official response, named government/military party
- severe: mass casualties, territorial change, sustained armed combat, declared emergency

CORROBORATION GATE: "nationally-significant" and "severe" require multi-source corroboration signal (you will receive source breadth in context). If source_breadth=1, cap significance at "notable".

## Severity scale
1 = minor/localized skirmish, no stated casualties
2 = moderate incident, limited casualties or isolated violence
3 = significant: named military/security forces, multiple casualties or multiple locations
4 = serious: sustained combat, mass arrests/violence, multiple fatalities at scale
5 = severe: mass-casualty event, large-scale sustained combat, declared emergency

## Title rules
- Max 90 characters. Factual, neutral. Use the article's stated facts only.
- Do NOT name ethnic/religious groups as actors unless a specific named organization is attributed.
- Do NOT invent actors, casualty counts, or causes not in the text.
- Do NOT adopt the source outlet's framing or partisan language.
- If actors are unclear, omit them: "Clashes reported in [Location]" not "Unknown groups clash."

## Anchor examples (verbatim calibration)
EXCLUDE (local-isolated, other): headline="Police arrest suspect in local assault" → {"include":false,"exclude_reason":"local crime, no broader fallout","category":"other","significance":"local-isolated","severity":1,"stability_impact":"none","title":"Police arrest suspect in local assault","actors":[],"location_confidence":"high"}

INCLUDE (nationally-significant, civil-unrest): headline="Killing sparks nationwide protests, minister resigns" → {"include":true,"exclude_reason":null,"category":"civil-unrest","significance":"nationally-significant","severity":3,"stability_impact":"Political crisis; sustained unrest and government instability possible","title":"Nationwide protests follow killing; minister resigns","actors":[],"location_confidence":"high"}

INCLUDE (severe, armed-conflict): headline="Sustained shelling and ground combat in contested border region" → {"include":true,"exclude_reason":null,"category":"armed-conflict","significance":"severe","severity":5,"stability_impact":"Territorial control at risk; humanitarian corridor threatened","title":"Sustained shelling and ground combat in [Region]","actors":[],"location_confidence":"high"}

EXCLUDE (business mis-coded as conflict): headline="Mining company reports record profits amid operational disruptions" → {"include":false,"exclude_reason":"business/finance content, no armed conflict","category":"other","significance":"local-isolated","severity":1,"stability_impact":"none","title":"Mining company reports record profits","actors":[],"location_confidence":"low"}

## Neutrality
State facts and concrete signals only. No partisan framing, no editorial language, no outlet's slant. If sources conflict on framing, describe the dispute plainly. Abstain rather than speculate.`

// ── Classify call ─────────────────────────────────────────────────────────────

export interface ClassifyContext {
  location: string
  date: string        // ISO date
  cameoCategory: string
  sourceBreadth: number // count of independent sources (tier1/tier2/specialist)
}

// One Haiku call per new cluster. Returns null → caller should discard the event.
// Retries once on JSON parse failure.
export async function classifyCluster(
  lead: LeadText,
  context: ClassifyContext,
): Promise<ClassifyResult | null> {
  const userMessage =
    `Location: ${context.location}\n` +
    `Date: ${context.date}\n` +
    `CAMEO category hint: ${context.cameoCategory}\n` +
    `Independent source count: ${context.sourceBreadth}\n\n` +
    `Headline: ${lead.headline}\n\n` +
    `Lead paragraph:\n${lead.lead}`

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0
      ? userMessage
      : `${userMessage}\n\nRespond with valid JSON only. No prose, no markdown.`

    try {
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
        messages: [{ role: 'user', content: prompt }],
      })

      const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
      const parsed = parseClassifyResponse(raw)
      if (parsed) return parsed
    } catch (err) {
      if (attempt === 1) {
        console.error('[enricher] classify call failed:', err)
        return null
      }
    }
  }

  return null
}

function parseClassifyResponse(raw: string): ClassifyResult | null {
  try {
    // Strip markdown fences if the model adds them despite instructions
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    const obj = JSON.parse(cleaned) as Partial<ClassifyResult>

    if (typeof obj.include !== 'boolean') return null
    if (typeof obj.severity !== 'number' || obj.severity < 1 || obj.severity > 5) return null
    if (typeof obj.title !== 'string' || !obj.title) return null

    return {
      include: obj.include,
      exclude_reason: obj.exclude_reason ?? null,
      category: obj.category ?? 'other',
      significance: obj.significance ?? 'local-isolated',
      severity: Math.round(obj.severity),
      stability_impact: obj.stability_impact ?? 'none',
      title: obj.title.slice(0, 90),
      actors: Array.isArray(obj.actors) ? obj.actors.filter(a => typeof a === 'string') : [],
      location_confidence: obj.location_confidence ?? 'medium',
    }
  } catch {
    return null
  }
}
