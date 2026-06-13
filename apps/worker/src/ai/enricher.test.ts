import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LeadText } from '../pipeline/fetcher.js'

const mockMessagesCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}))

const { classifyCluster, resolveLocation } = await import('./enricher.js')

const sampleLead: LeadText = {
  headline: 'Sustained shelling reported in eastern Ukraine as Russian forces advance',
  lead: 'Russian artillery struck multiple cities in the Donbas region on Thursday, killing at least 12 civilians and injuring dozens more. Ukrainian military confirmed active defensive operations along a 40-kilometre front.',
  sourceDomain: 'reuters.com',
}

const sampleContext = {
  location: 'Donbas, Ukraine',
  date: '2024-06-01',
  cameoCategory: '19',
  sourceBreadth: 4,
}

const validIncludeResponse = JSON.stringify({
  include: true,
  exclude_reason: null,
  category: 'armed-conflict',
  significance: 'severe',
  severity: 5,
  stability_impact: 'Active front-line combat with mass casualties; territorial control contested',
  title: 'Russian shelling kills 12 in Donbas as Ukrainian forces defend',
  actors: ['Russia', 'Ukraine'],
  location_confidence: 'high',
})

const validExcludeResponse = JSON.stringify({
  include: false,
  exclude_reason: 'business/finance content, no armed conflict',
  category: 'other',
  significance: 'local-isolated',
  severity: 1,
  stability_impact: 'none',
  title: 'Mining company reports record profits',
  actors: [],
  location_confidence: 'low',
})

describe('classifyCluster', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
  })

  it('returns a ClassifyResult with include=true for a conflict article', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: validIncludeResponse }],
    })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result).not.toBeNull()
    expect(result!.include).toBe(true)
    expect(result!.category).toBe('armed-conflict')
    expect(result!.severity).toBe(5)
    expect(result!.title).toBe('Russian shelling kills 12 in Donbas as Ukrainian forces defend')
  })

  it('returns a ClassifyResult with include=false for a non-conflict article', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: validExcludeResponse }],
    })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result).not.toBeNull()
    expect(result!.include).toBe(false)
    expect(result!.exclude_reason).toBe('business/finance content, no armed conflict')
  })

  it('uses claude-haiku-4-5 model', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: validIncludeResponse }],
    })
    await classifyCluster(sampleLead, sampleContext)
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    )
  })

  it('retries once on JSON parse failure and returns result on second attempt', async () => {
    mockMessagesCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'not valid json' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: validIncludeResponse }] })

    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result).not.toBeNull()
    expect(result!.include).toBe(true)
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)
  })

  it('returns null when both attempts fail to parse', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result).toBeNull()
  })

  it('returns null when the API call throws', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('network error'))
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result).toBeNull()
  })

  it('strips markdown fences from response before parsing', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + validIncludeResponse + '\n```' }],
    })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result).not.toBeNull()
    expect(result!.include).toBe(true)
  })

  it('caps title at 90 characters', async () => {
    const longTitleResponse = JSON.stringify({
      ...JSON.parse(validIncludeResponse),
      title: 'A'.repeat(120),
    })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: longTitleResponse }],
    })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result).not.toBeNull()
    expect(result!.title.length).toBeLessThanOrEqual(90)
  })

  it('returns null when response is missing required include field', async () => {
    const badResponse = JSON.stringify({ severity: 3, title: 'Some event' })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: badResponse }],
    })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result).toBeNull()
  })

  it('parses primary_location and valid coordinates from the response', async () => {
    const withCoords = JSON.stringify({
      ...JSON.parse(validIncludeResponse),
      primary_location: 'Belfast, United Kingdom',
      lat: 54.597,
      lng: -5.93,
    })
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: withCoords }] })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result!.primary_location).toBe('Belfast, United Kingdom')
    expect(result!.lat).toBe(54.597)
    expect(result!.lng).toBe(-5.93)
  })

  it('rejects out-of-range coordinates as null', async () => {
    const badCoords = JSON.stringify({
      ...JSON.parse(validIncludeResponse),
      lat: 999, lng: -5.93,
    })
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: badCoords }] })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result!.lat).toBeNull()
    expect(result!.lng).toBe(-5.93)
  })

  it('defaults coordinates to null when the model omits them', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: validIncludeResponse }] })
    const result = await classifyCluster(sampleLead, sampleContext)
    expect(result!.lat).toBeNull()
    expect(result!.lng).toBeNull()
    expect(result!.primary_location).toBe('')
  })
})

describe('resolveLocation', () => {
  const gdelt = { lat: 39.06, lng: 34.91, region: 'Turkey' } // GDELT's wrong centroid

  it('overrides GDELT coords when the model is highly confident with valid coords', () => {
    const r = resolveLocation(gdelt, {
      lat: 54.597, lng: -5.93, primary_location: 'Belfast, United Kingdom', location_confidence: 'high',
    })
    expect(r.lat).toBe(54.597)
    expect(r.lng).toBe(-5.93)
    expect(r.region).toBe('Belfast, United Kingdom')
    expect(r.locationConfidence).toBe('high')
  })

  it('keeps GDELT coords when the model is not highly confident', () => {
    const r = resolveLocation(gdelt, {
      lat: 54.597, lng: -5.93, primary_location: 'Belfast, United Kingdom', location_confidence: 'medium',
    })
    expect(r.lat).toBe(39.06)
    expect(r.lng).toBe(34.91)
    expect(r.region).toBe('Turkey')
    expect(r.locationConfidence).toBe('medium')
  })

  it('keeps GDELT coords when the model gives no coordinates', () => {
    const r = resolveLocation(gdelt, {
      lat: null, lng: null, primary_location: '', location_confidence: 'high',
    })
    expect(r.lat).toBe(39.06)
    expect(r.lng).toBe(34.91)
  })

  it('rejects the 0,0 null-island artifact even at high confidence', () => {
    const r = resolveLocation(gdelt, {
      lat: 0, lng: 0, primary_location: 'Nowhere', location_confidence: 'high',
    })
    expect(r.lat).toBe(39.06)
    expect(r.lng).toBe(34.91)
  })
})
