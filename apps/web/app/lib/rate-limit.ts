// In-memory sliding-window rate limiter for cost-bearing routes.
//
// Per-instance only: a multi-instance deployment multiplies the effective
// limit by the instance count. That still bounds abuse of LLM-spending
// endpoints; move to a shared store (Upstash) if instances scale out.

interface Window {
  timestamps: number[]
}

const buckets = new Map<string, Window>()
const MAX_BUCKETS = 10_000

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export function rateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs

  // Bound memory: drop everything when the table grows pathological
  if (buckets.size > MAX_BUCKETS) buckets.clear()

  const bucket = buckets.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter(t => t > cutoff)

  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0]
    buckets.set(key, bucket)
    return { allowed: false, retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000) }
  }

  bucket.timestamps.push(now)
  buckets.set(key, bucket)
  return { allowed: true, retryAfterSeconds: 0 }
}

export function clientKey(request: Request): string {
  // Behind Vercel/proxies the client address is the first x-forwarded-for hop
  const fwd = request.headers.get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || 'unknown'
}
