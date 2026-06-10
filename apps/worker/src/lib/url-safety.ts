// SSRF guard for user-supplied webhook URLs.
//
// Static checks only: https scheme, no loopback/private/link-local IP
// literals, no obviously internal hostnames. A hostname that *resolves* to a
// private address at request time is not caught here — that requires DNS
// pinning at the HTTP layer. These checks close the common metadata-endpoint
// and internal-service vectors.

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '[::1]', '::1'])
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localdomain']

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)]
  if (a === 127 || a === 10 || a === 0) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true // link-local / cloud metadata
  return false
}

export function isSafeWebhookUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false

  const host = url.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(host)) return false
  if (BLOCKED_SUFFIXES.some(s => host.endsWith(s))) return false
  if (isPrivateIpv4(host)) return false
  // IPv6 literals other than public ones are hard to classify statically — block all
  if (host.startsWith('[') || host.includes(':')) return false

  return true
}
