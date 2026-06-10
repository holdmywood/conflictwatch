import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMessagesCreate = vi.fn()
const mockAssessmentCreate = vi.fn().mockResolvedValue({ id: 'asmt-1' })
const mockConflictFindMany = vi.fn().mockResolvedValue([])
const mockConflictFindUnique = vi.fn().mockResolvedValue(null)
const mockConflictUpdate = vi.fn().mockResolvedValue({})

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}))

const mockAssessmentFindFirst = vi.fn().mockResolvedValue(null)

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    assessment: { create: mockAssessmentCreate, findFirst: mockAssessmentFindFirst },
    conflict: {
      findMany: mockConflictFindMany,
      findUnique: mockConflictFindUnique,
      update: mockConflictUpdate,
    },
  },
}))

const { generatePrediction, generateDailyReport, generateSituationLine, runHourlyAssessments, hasNewEvents } =
  await import('./assessor.js')

const sampleEvents = [
  {
    id: 'evt-1',
    title: 'Russia: armed-conflict in Kyiv, Ukraine',
    eventType: 'armed-conflict',
    confidence: 'high',
    publishedAt: new Date('2026-06-03T10:00:00Z'),
    region: 'Kyiv, Ukraine',
  },
]

describe('generatePrediction', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
    mockAssessmentCreate.mockReset().mockResolvedValue({ id: 'asmt-1' })
    mockConflictFindMany.mockReset().mockResolvedValue([])
    mockConflictFindUnique.mockReset().mockResolvedValue(null)
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Escalation likely over the next 24 hours.' }],
    })
  })

  it('stores a prediction assessment with correct kind and region', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'prediction',
        region: 'conflict-ua',
        body: 'Escalation likely over the next 24 hours.',
        usedEventIds: ['evt-1'],
      }),
    })
  })

  it('does not call Claude when events array is empty', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', [])
    expect(mockMessagesCreate).not.toHaveBeenCalled()
    expect(mockAssessmentCreate).not.toHaveBeenCalled()
  })

  it('calls Claude with the Haiku model (cost doctrine: Haiku for narratives)', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    )
  })

  it('derives high confidence when any event is high', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ confidence: 'high' }),
    })
  })

  it('derives low confidence when all events are low', async () => {
    const lowEvents = [{ ...sampleEvents[0], confidence: 'low' }]
    await generatePrediction('conflict-ua', 'Ukraine', lowEvents)
    expect(mockAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ confidence: 'low' }),
    })
  })
})

describe('generateDailyReport', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
    mockAssessmentCreate.mockReset().mockResolvedValue({ id: 'asmt-2' })
    mockConflictFindMany.mockReset().mockResolvedValue([])
    mockConflictFindUnique.mockReset().mockResolvedValue(null)
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Heavy fighting reported in eastern regions.' }],
    })
  })

  it('stores a dailyReport assessment', async () => {
    const date = new Date('2026-06-03T00:00:00Z')
    await generateDailyReport('conflict-ua', 'Ukraine', date, sampleEvents)
    expect(mockAssessmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'dailyReport',
        region: 'conflict-ua',
        body: 'Heavy fighting reported in eastern regions.',
        usedEventIds: ['evt-1'],
      }),
    })
  })

  it('does not call Claude when events array is empty', async () => {
    await generateDailyReport('conflict-ua', 'Ukraine', new Date(), [])
    expect(mockMessagesCreate).not.toHaveBeenCalled()
    expect(mockAssessmentCreate).not.toHaveBeenCalled()
  })
})

describe('generateSituationLine', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
    mockConflictUpdate.mockReset().mockResolvedValue({})
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Heavy artillery exchanges continue along the eastern front.' }],
    })
  })

  it('updates Conflict.currentSituationLine with Haiku response', async () => {
    await generateSituationLine('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockConflictUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conflict-ua' },
        data: expect.objectContaining({
          currentSituationLine: 'Heavy artillery exchanges continue along the eastern front.',
        }),
      })
    )
  })

  it('uses claude-haiku-4-5-20251001 model (cost gate)', async () => {
    await generateSituationLine('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    )
  })

  it('does not call Claude when events array is empty', async () => {
    await generateSituationLine('conflict-ua', 'Ukraine', [])
    expect(mockMessagesCreate).not.toHaveBeenCalled()
    expect(mockConflictUpdate).not.toHaveBeenCalled()
  })

  it('truncates line to 200 characters', async () => {
    const longLine = 'A'.repeat(250)
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: longLine }],
    })
    await generateSituationLine('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockConflictUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentSituationLine: expect.stringMatching(/^A{200}$/),
        }),
      })
    )
  })
})

describe('hasNewEvents', () => {
  it('returns true when an event id is not covered by the last assessment', () => {
    expect(hasNewEvents(['evt-1', 'evt-2'], ['evt-1'])).toBe(true)
  })
  it('returns false when all current events were already assessed', () => {
    expect(hasNewEvents(['evt-1'], ['evt-1', 'evt-0'])).toBe(false)
  })
  it('returns true when there is no previous assessment', () => {
    expect(hasNewEvents(['evt-1'], null)).toBe(true)
  })
})

describe('runHourlyAssessments change gate', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: 'Outlook text.' }],
    })
    mockAssessmentCreate.mockReset().mockResolvedValue({ id: 'asmt-1' })
    mockAssessmentFindFirst.mockReset().mockResolvedValue(null)
    mockConflictFindMany.mockReset()
    mockConflictUpdate.mockReset().mockResolvedValue({})
  })

  it('skips conflicts whose events are all covered by the latest assessment', async () => {
    mockConflictFindMany.mockResolvedValue([
      { id: 'conflict-ua', name: 'Ukraine', events: sampleEvents },
    ])
    mockAssessmentFindFirst.mockResolvedValue({ usedEventIds: ['evt-1'] })

    await runHourlyAssessments()

    expect(mockMessagesCreate).not.toHaveBeenCalled()
    expect(mockAssessmentCreate).not.toHaveBeenCalled()
  })

  it('assesses conflicts that have events the last assessment did not use', async () => {
    mockConflictFindMany.mockResolvedValue([
      { id: 'conflict-ua', name: 'Ukraine', events: sampleEvents },
    ])
    mockAssessmentFindFirst.mockResolvedValue({ usedEventIds: ['evt-0'] })

    await runHourlyAssessments()

    expect(mockAssessmentCreate).toHaveBeenCalled()
  })
})
