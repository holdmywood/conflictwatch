import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRuleFindMany = vi.fn()
const mockConflictFindMany = vi.fn()
const mockSignalFindFirst = vi.fn()
const mockEventFindFirst = vi.fn()
const mockAlertFindFirst = vi.fn()
const mockAlertCreate = vi.fn().mockResolvedValue({ id: 'alert-1' })
const mockAlertUpdate = vi.fn().mockResolvedValue({})
const mockFetch = vi.fn().mockResolvedValue({ ok: true })

vi.stubGlobal('fetch', mockFetch)

vi.mock('@conflictwatch/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('@conflictwatch/db')>()
  return {
    ...original,
    prisma: {
      watchlistRule: { findMany: mockRuleFindMany },
      conflict: { findMany: mockConflictFindMany },
      escalationSignal: { findFirst: mockSignalFindFirst },
      event: { findFirst: mockEventFindFirst },
      alert: { findFirst: mockAlertFindFirst, create: mockAlertCreate, update: mockAlertUpdate },
    },
  }
})

const { evaluateWatchlistRules } = await import('./evaluateWatchlistRules.js')

const BASE_CONFLICT = { id: 'c-1', name: 'Ukraine War', region: 'Kyiv, Ukraine', threatLevel: 4 }
const BASE_RULE = {
  id: 'rule-1',
  userId: 'user-1',
  zoneFilter: [],
  minPEscalation: null,
  minSurpriseScore: null,
  minThreatLevel: 3,
  webhookUrl: null,
  slackWebhookUrl: null,
  dedupWindowHours: 24,
  user: { id: 'user-1' },
}

describe('evaluateWatchlistRules', () => {
  beforeEach(() => {
    mockRuleFindMany.mockReset().mockResolvedValue([])
    mockConflictFindMany.mockReset().mockResolvedValue([BASE_CONFLICT])
    mockSignalFindFirst.mockReset().mockResolvedValue(null)
    mockEventFindFirst.mockReset().mockResolvedValue(null)
    mockAlertFindFirst.mockReset().mockResolvedValue(null) // no dedup
    mockAlertCreate.mockReset().mockResolvedValue({ id: 'alert-1' })
    mockAlertUpdate.mockReset().mockResolvedValue({})
    mockFetch.mockReset().mockResolvedValue({ ok: true })
  })

  it('does nothing when no rules exist', async () => {
    mockRuleFindMany.mockResolvedValue([])
    await evaluateWatchlistRules()
    expect(mockConflictFindMany).not.toHaveBeenCalled()
    expect(mockAlertCreate).not.toHaveBeenCalled()
  })

  it('creates alert when threatLevel threshold is met', async () => {
    mockRuleFindMany.mockResolvedValue([BASE_RULE])
    await evaluateWatchlistRules()
    expect(mockAlertCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleId: 'rule-1', conflictId: 'c-1' }),
      })
    )
  })

  it('skips conflict below threatLevel threshold', async () => {
    mockRuleFindMany.mockResolvedValue([{ ...BASE_RULE, minThreatLevel: 5 }])
    mockConflictFindMany.mockResolvedValue([{ ...BASE_CONFLICT, threatLevel: 3 }])
    await evaluateWatchlistRules()
    expect(mockAlertCreate).not.toHaveBeenCalled()
  })

  it('deduplicates: does not fire if alert already exists within window', async () => {
    mockRuleFindMany.mockResolvedValue([BASE_RULE])
    mockAlertFindFirst.mockResolvedValue({ id: 'existing-alert' })
    await evaluateWatchlistRules()
    expect(mockAlertCreate).not.toHaveBeenCalled()
  })

  it('delivers to webhook when url is set', async () => {
    mockRuleFindMany.mockResolvedValue([{ ...BASE_RULE, webhookUrl: 'https://example.com/hook' }])
    await evaluateWatchlistRules()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockAlertUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveredAt: expect.any(Date) }) })
    )
  })

  it('records delivery error when webhook returns non-ok', async () => {
    mockRuleFindMany.mockResolvedValue([{ ...BASE_RULE, webhookUrl: 'https://example.com/hook' }])
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await evaluateWatchlistRules()
    expect(mockAlertUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveryError: expect.stringContaining('HTTP 500') }) })
    )
  })
})
