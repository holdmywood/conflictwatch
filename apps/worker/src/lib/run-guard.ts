// Non-overlap guard for cron-fired cycles.
//
// node-cron fires on schedule regardless of whether the previous run finished;
// a slow cycle (lead fetches + classify calls) overlapping itself means
// double-classification and interleaved writes. The guard skips while a run is
// in flight — and if the in-flight run exceeds the hard limit, it is presumed
// hung (stuck network call) and onStuck fires. The default onStuck exits the
// process so the platform restarts a clean worker rather than silently serving
// stale data.

interface CycleGuardOptions {
  hardLimitMs: number
  onStuck?: () => void
}

export function createCycleGuard(
  fn: () => Promise<void>,
  { hardLimitMs, onStuck }: CycleGuardOptions,
): () => Promise<void> {
  let running = false
  let startedAt = 0

  const handleStuck = onStuck ?? (() => {
    console.error(`[run-guard] cycle stuck for >${hardLimitMs}ms — exiting for platform restart`)
    process.exit(1)
  })

  return async () => {
    if (running) {
      const elapsed = Date.now() - startedAt
      if (elapsed > hardLimitMs) {
        handleStuck()
        return
      }
      console.warn(`[run-guard] previous cycle still running (${Math.round(elapsed / 1000)}s) — skipping`)
      return
    }

    running = true
    startedAt = Date.now()
    try {
      await fn()
    } finally {
      running = false
    }
  }
}
