/**
 * Startup environment validation. Next.js runs register() once when the
 * server boots. We fail loud on missing REQUIRED config and log a clear
 * inventory of which optional integrations are active — so a misconfigured
 * deploy is obvious in the logs rather than silently degraded.
 */
export async function register() {
  // Only the Node.js server runtime has process.env for our backend config.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const required = ['DATABASE_URL']
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    // Throwing here aborts boot — the platform shows a failed deploy rather
    // than a half-working site that 500s on every DB call.
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}. ` +
        'Set them in the hosting provider before deploying.'
    )
  }

  const optional: Record<string, string> = {
    ANTHROPIC_API_KEY: 'event summaries (/api/events/[id]/summary)',
    EXPORT_API_KEY: 'data export endpoint (/api/v1/export)',
    AISSTREAM_API_KEY: 'live vessel positions (hotspot Maritime tab)',
    COMMODITIES_API_KEY: 'commodity prices (news commodities strip)',
    OPENSKY_CLIENT_ID: 'raised ADS-B rate limit',
  }
  const active: string[] = []
  const inactive: string[] = []
  for (const [key, desc] of Object.entries(optional)) {
    ;(process.env[key] ? active : inactive).push(`${key} (${desc})`)
  }

  console.log('[env] required config present:', required.join(', '))
  if (active.length) console.log('[env] optional integrations ACTIVE:\n  - ' + active.join('\n  - '))
  if (inactive.length)
    console.log(
      '[env] optional integrations INACTIVE (honest placeholders shown):\n  - ' + inactive.join('\n  - ')
    )
}
