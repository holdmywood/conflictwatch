import { describe, it, expect, vi } from 'vitest'
import { createCycleGuard } from './run-guard.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}

describe('createCycleGuard', () => {
  it('runs the wrapped function', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const guarded = createCycleGuard(fn, { hardLimitMs: 1000, onStuck: vi.fn() })
    await guarded()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('skips invocation while a previous run is in flight', async () => {
    const gate = deferred()
    const fn = vi.fn().mockImplementation(() => gate.promise)
    const guarded = createCycleGuard(fn, { hardLimitMs: 60_000, onStuck: vi.fn() })

    const first = guarded()
    await guarded() // should skip — first still running
    expect(fn).toHaveBeenCalledTimes(1)

    gate.resolve()
    await first
  })

  it('runs again after the previous run completes', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const guarded = createCycleGuard(fn, { hardLimitMs: 1000, onStuck: vi.fn() })
    await guarded()
    await guarded()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('releases the lock when the wrapped function throws', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    const guarded = createCycleGuard(fn, { hardLimitMs: 1000, onStuck: vi.fn() })
    await expect(guarded()).rejects.toThrow('boom')
    await guarded()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('calls onStuck when an in-flight run exceeds the hard limit', async () => {
    vi.useFakeTimers()
    try {
      const gate = deferred()
      const fn = vi.fn().mockImplementation(() => gate.promise)
      const onStuck = vi.fn()
      const guarded = createCycleGuard(fn, { hardLimitMs: 10_000, onStuck })

      const first = guarded()
      vi.advanceTimersByTime(15_000)
      await guarded() // in-flight past hard limit → stuck
      expect(onStuck).toHaveBeenCalledTimes(1)

      gate.resolve()
      await first
    } finally {
      vi.useRealTimers()
    }
  })
})
