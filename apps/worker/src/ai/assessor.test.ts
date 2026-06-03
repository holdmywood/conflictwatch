import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMessagesCreate = vi.fn()
const mockAssessmentCreate = vi.fn().mockResolvedValue({ id: 'asmt-1' })
const mockConflictFindMany = vi.fn().mockResolvedValue([])
const mockConflictFindUnique = vi.fn().mockResolvedValue(null)

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}))

vi.mock('@conflictwatch/db', () => ({
  prisma: {
    assessment: { create: mockAssessmentCreate },
    conflict: {
      findMany: mockConflictFindMany,
      findUnique: mockConflictFindUnique,
    },
  },
}))

const { generatePrediction, generateDailyReport } = await import('./assessor.js')

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

  it('calls Claude with model claude-sonnet-4-6', async () => {
    await generatePrediction('conflict-ua', 'Ukraine', sampleEvents)
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' })
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
