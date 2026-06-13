import { prisma } from '@conflictwatch/db'

export type Tier = 'tier1' | 'tier2' | 'specialist' | 'blocked' | 'review' | 'unknown'

// ── Hardcoded seed tiers ──────────────────────────────────────────────────────
// These are the startup defaults. DomainReliability table overrides any entry
// here and can promote 'review'/'unknown' domains without a code deploy.
// Tier reflects editorial standards, not nationality — credible regional papers
// of record appear at tier1 alongside global wires.
const SEED_TIERS: Record<string, Tier> = {
  // Tier 1 — wire services and international papers of record
  'reuters.com': 'tier1',
  'apnews.com': 'tier1',
  'ap.org': 'tier1',
  'afp.com': 'tier1',
  'bloomberg.com': 'tier1',
  'bbc.co.uk': 'tier1',
  'bbc.com': 'tier1',
  'aljazeera.com': 'tier1',
  'rferl.org': 'tier1',
  'france24.com': 'tier1',
  'dw.com': 'tier1',
  'voanews.com': 'tier1',
  'theguardian.com': 'tier1',
  'nytimes.com': 'tier1',
  'washingtonpost.com': 'tier1',
  'ft.com': 'tier1',
  'wsj.com': 'tier1',
  'economist.com': 'tier1',
  'lemonde.fr': 'tier1',
  'spiegel.de': 'tier1',
  'thenationalnews.com': 'tier1',
  'aa.com.tr': 'tier1',       // Anadolu Agency
  'tass.com': 'tier1',        // wire agency; selection biased but facts generally reported accurately
  'xinhua.net': 'tier1',      // same caveat as TASS
  // Tier 2 — established national/regional press with editorial standards
  'independent.co.uk': 'tier2',
  'telegraph.co.uk': 'tier2',
  'politico.com': 'tier2',
  'axios.com': 'tier2',
  'thehill.com': 'tier2',
  'cnn.com': 'tier2',
  'nbcnews.com': 'tier2',
  'cbsnews.com': 'tier2',
  'abcnews.go.com': 'tier2',
  'haaretz.com': 'tier2',
  'jpost.com': 'tier2',
  'timesofisrael.com': 'tier2',
  'arabnews.com': 'tier2',
  'thenational.ae': 'tier2',
  'middleeasteye.net': 'tier2',
  'timesofindia.com': 'tier2',
  'hindustantimes.com': 'tier2',
  'theprint.in': 'tier2',
  'dawn.com': 'tier2',
  'thenews.com.pk': 'tier2',
  'scmp.com': 'tier2',
  'straitstimes.com': 'tier2',
  'bangkokpost.com': 'tier2',
  'thejakartapost.com': 'tier2',
  'koreaherald.com': 'tier2',
  'japantimes.co.jp': 'tier2',
  'kyodonews.net': 'tier2',
  'mg.co.za': 'tier2',
  'dailynation.co.ke': 'tier2',
  'dailymaverick.co.za': 'tier2',
  'premiumtimesng.com': 'tier2',
  'monitor.co.ug': 'tier2',
  'allafrica.com': 'tier2',
  'elpais.com': 'tier2',
  'corriere.it': 'tier2',
  'lefigaro.fr': 'tier2',
  'diepresse.com': 'tier2',
  // Specialist — conflict/OSINT/market-structure domain authority
  'acleddata.com': 'specialist',
  'understandingwar.org': 'specialist',
  'iiss.org': 'specialist',
  'crisisgroup.org': 'specialist',
  'sipri.org': 'specialist',
  'bellingcat.com': 'specialist',
  'airwaves.live': 'specialist',
  // Blocked — documented fabrication, content farms, SEO aggregators
  'rt.com': 'blocked',
  'sputniknews.com': 'blocked',
  'sputnik.com': 'blocked',
  'presstv.ir': 'blocked',
  'presstv.com': 'blocked',
  'globalresearch.ca': 'blocked',
  'beforeitsnews.com': 'blocked',
  'naturalnews.com': 'blocked',
  'infowars.com': 'blocked',
  'worldtribune.com': 'blocked',
  'veteranstoday.com': 'blocked',
  'activistpost.com': 'blocked',
  'hangthebankers.com': 'blocked',
  'themindunleashed.com': 'blocked',
  // Review queue — domains that need manual evaluation before promotion
  'zerohedge.com': 'review',
  'oilprice.com': 'review',
}

// ── In-memory cache ───────────────────────────────────────────────────────────
// Loaded at startup from DomainReliability (which overrides SEED_TIERS).
// Unknown domains → 'unknown' (fail-closed). Refreshed every 10 minutes.

let cache: Map<string, Tier> = new Map(Object.entries(SEED_TIERS))
let cacheLoadedAt = 0
const CACHE_TTL_MS = 10 * 60 * 1000

export async function initTrustGate(): Promise<void> {
  await refreshCache()
}

async function refreshCache(): Promise<void> {
  try {
    const rows = await prisma.domainReliability.findMany()
    const fresh = new Map<string, Tier>(Object.entries(SEED_TIERS))
    for (const row of rows) {
      fresh.set(row.domain, row.tier as Tier)
    }
    cache = fresh
    cacheLoadedAt = Date.now()
  } catch (err) {
    // Non-fatal — keep using current cache until DB is reachable
    console.warn('[trust] cache refresh failed, using stale data:', err)
  }
}

async function getCache(): Promise<Map<string, Tier>> {
  if (Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await refreshCache()
  }
  return cache
}

// ── Public API ────────────────────────────────────────────────────────────────

export function extractDomain(url: string): string {
  try {
    const u = new URL(url)
    // Strip 'www.' prefix so reuters.com and www.reuters.com resolve the same
    return u.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Resolve a host to a tier, matching subdomains against parent domains.
// Tries the exact host first, then strips one leading label at a time and
// re-checks — but only ever returns an actual cache hit, so we never guess a
// registrable domain (avoids the co.uk / com.au public-suffix trap).
// e.g. english.elpais.com → elpais.com; news.rt.com → rt.com (blocked).
function lookupTier(host: string, tiers: Map<string, Tier>): Tier {
  let h = host
  while (h.split('.').length >= 2) {
    const t = tiers.get(h)
    if (t) return t
    const dot = h.indexOf('.')
    if (dot < 0) break
    h = h.slice(dot + 1)
  }
  return 'unknown'
}

export async function domainTier(url: string): Promise<Tier> {
  const domain = extractDomain(url)
  if (!domain) return 'unknown'
  const tiers = await getCache()
  return lookupTier(domain, tiers)
}

// Returns the highest tier found across a list of URLs.
// 'tier1' > 'tier2' > 'specialist' > 'review' > 'unknown' > 'blocked'
const TIER_RANK: Record<Tier, number> = {
  tier1: 5, tier2: 4, specialist: 3, review: 2, unknown: 1, blocked: 0,
}

export async function bestTier(urls: string[]): Promise<Tier> {
  let best: Tier = 'unknown'
  const tiers = await getCache()
  for (const url of urls) {
    const domain = extractDomain(url)
    const t = domain ? lookupTier(domain, tiers) : 'unknown'
    if (TIER_RANK[t] > TIER_RANK[best]) best = t
  }
  return best
}

// A cluster passes if at least one source URL is from a non-blocked domain.
// Only clusters whose every source is on the fabrication 'blocked' list are
// rejected. The heavy lifting is done upstream by the conflict-severity gates
// (CAMEO codes, Goldstein, tone, article count) and downstream by AI
// classification; this gate exists solely to keep known-fabrication outlets out.
export async function clusterHasTrustedSource(urls: string[]): Promise<boolean> {
  const tiers = await getCache()
  let hasUsable = false
  for (const url of urls) {
    const domain = extractDomain(url)
    if (!domain) continue
    if (lookupTier(domain, tiers) !== 'blocked') {
      hasUsable = true
    }
  }
  return hasUsable
}

// Record a domain usage so reliability scores can be computed over time.
export async function recordDomainUsage(domain: string): Promise<void> {
  try {
    await prisma.domainReliability.upsert({
      where: { domain },
      create: {
        domain,
        tier: SEED_TIERS[domain] ?? 'unknown',
        totalUsageCount: 1,
      },
      update: {
        totalUsageCount: { increment: 1 },
        lastUpdatedAt: new Date(),
      },
    })
  } catch {
    // Non-fatal — usage tracking is best-effort
  }
}
