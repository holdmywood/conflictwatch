import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockHeartbeatFindUnique = vi.fn()

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    heartbeat: { findUnique: mockHeartbeatFindUnique },
  },
}))

const { checkStaleness, _resetAlertState } = await import('./staleness-alert.js')

const MINUTE_MS = 60 * 1000

describe('checkStaleness', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    mockHeartbeatFindUnique.mockReset()
    fetchMock.mockReset().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', 'https://hooks.example.com/ops')
    _resetAlertState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('does not alert when ingestion is fresh', async () => {
    mockHeartbeatFindUnique.mockResolvedValue({
      lastIngestedAt: new Date(Date.now() - 5 * MINUTE_MS),
    })
    await checkStaleness(30)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fires the ops webhook when ingestion is stale past the threshold', async () => {
    mockHeartbeatFindUnique.mockResolvedValue({
      lastIngestedAt: new Date(Date.now() - 45 * MINUTE_MS),
    })
    const fired = await checkStaleness(30)
    expect(fired).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example.com/ops',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('alerts when no heartbeat row exists at all', async () => {
    mockHeartbeatFindUnique.mockResolvedValue(null)
    const fired = await checkStaleness(30)
    expect(fired).toBe(true)
  })

  it('does not re-alert within the cooldown window', async () => {
    mockHeartbeatFindUnique.mockResolvedValue({
      lastIngestedAt: new Date(Date.now() - 45 * MINUTE_MS),
    })
    await checkStaleness(30)
    await checkStaleness(30)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('skips silently when no ops webhook is configured', async () => {
    vi.stubEnv('OPS_ALERT_WEBHOOK_URL', '')
    mockHeartbeatFindUnique.mockResolvedValue({
      lastIngestedAt: new Date(Date.now() - 45 * MINUTE_MS),
    })
    const fired = await checkStaleness(30)
    expect(fired).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
