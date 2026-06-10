/* Severity channel (present state): warm ramp, always paired with S-numeral. */
export const SEV_COLORS = ['', '#76715f', '#a68c4b', '#c99838', '#e0742e', '#ef5b45'] as const

export function sevColor(level: number): string {
  return SEV_COLORS[Math.min(Math.max(level, 1), 5)] ?? SEV_COLORS[1]
}

/* Forecast channel (escalation probability): cool ramp, brighter = higher. */
export function forecastColor(p: number | null): string {
  if (p === null) return 'var(--text-3)'
  if (p < 0.2) return 'var(--fc-low)'
  if (p < 0.5) return 'var(--fc-mid)'
  if (p < 0.75) return 'var(--fc-high)'
  return 'var(--fc-crit)'
}

/* ── Formatting: one convention everywhere ─────────────────── */

/** 0.42 → "42%" */
export function fmtPct(p: number, dp = 0): string {
  return `${(p * 100).toFixed(dp)}%`
}

/** ISO string → "2026-06-10 14:32Z" */
export function fmtUTC(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toISOString().slice(0, 16).replace('T', ' ')}Z`
}

/** ISO string → "2026-06-10" */
export function fmtDateUTC(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

/** Elapsed → "42s" / "12m" / "3h" / "2d" */
export function fmtAgo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** 1234567 → "1,234,567" */
export function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

/* Hazard channel (natural disasters): single teal hue, kind conveyed by
   glyph + label, urgency by size/pulse — never confusable with the warm
   severity ramp or the cool-blue forecast channel. */
export const HAZARD_COLOR = '#4fb3a6'

/* Contamination channel: muted orchid — distinct from severity (warm),
   forecast (blue) and hazard (teal). */
export const OUTBREAK_COLOR = '#b07ab0'
