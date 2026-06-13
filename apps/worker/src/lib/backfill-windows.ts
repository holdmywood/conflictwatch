// Generates GDELT 2.0 15-minute window timestamps for the historical backfill.
// GDELT publishes export/mentions files every 15 minutes at :00/:15/:30/:45 UTC,
// named YYYYMMDDHHMMSS. Returns timestamps MOST-RECENT-FIRST so the backfill
// populates the freshest week of evidence before older windows.

const WINDOW_MS = 15 * 60 * 1000

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`
  )
}

// All 15-minute window timestamps over the trailing `days`, newest first.
// Starts one window before `now` (the current window may not be published yet).
export function recentWindows(now: Date, days: number): string[] {
  const aligned = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS
  const count = days * 24 * 4 // 96 windows/day
  const out: string[] = []
  for (let i = 1; i <= count; i++) {
    out.push(fmt(new Date(aligned - i * WINDOW_MS)))
  }
  return out
}
