import { describe, it, expect } from 'vitest'
import { scoreThreat, toEventType, scoreConfidence, computeSourceBreadth } from './score.js'

describe('scoreThreat', () => {
  it('rates armed conflict (19) as 5', () => {
    expect(scoreThreat('19')).toBe(5)
  })
  it('rates mass violence (20) as 5', () => {
    expect(scoreThreat('20')).toBe(5)
  })
  it('rates assault (18) as 4', () => {
    expect(scoreThreat('18')).toBe(4)
  })
  it('rates coercion (17) as 3', () => {
    expect(scoreThreat('17')).toBe(3)
  })
  it('returns 1 for unknown code', () => {
    expect(scoreThreat('')).toBe(1)
  })
})

describe('toEventType', () => {
  it('maps root code 19 to armed-conflict', () => {
    expect(toEventType('19')).toBe('armed-conflict')
  })
  it('maps root code 14 to protest', () => {
    expect(toEventType('14')).toBe('protest')
  })
  it('maps root code 1 to diplomatic', () => {
    expect(toEventType('1')).toBe('diplomatic')
  })
})

describe('scoreConfidence', () => {
  it('returns low for 1 distinct source', () => {
    expect(scoreConfidence(['Reuters'])).toBe('low')
  })
  it('returns medium for 2 distinct sources', () => {
    expect(scoreConfidence(['Reuters', 'BBC'])).toBe('medium')
  })
  it('returns high for 3+ distinct sources', () => {
    expect(scoreConfidence(['Reuters', 'BBC', 'Al Jazeera'])).toBe('high')
  })
  it('collapses wire syndication — AP republished 20 times counts as one source', () => {
    const names = Array(20).fill('Associated Press via CNN').concat(['BBC'])
    expect(scoreConfidence(names)).toBe('medium')
  })
  it('collapses Reuters syndication', () => {
    const names = ['Reuters UK', 'Reuters India', 'Reuters US', 'BBC', 'Al Jazeera']
    expect(scoreConfidence(names)).toBe('high') // reuters=1 + bbc=1 + aljazeera=1
  })
  it('does not collapse "Japan Times" as AP wire', () => {
    expect(scoreConfidence(['Japan Times', 'BBC'])).toBe('medium') // 2 distinct, not collapsed to 1
  })
})

describe('computeSourceBreadth', () => {
  it('counts distinct canonical sources', () => {
    expect(computeSourceBreadth(['Reuters', 'BBC', 'Al Jazeera'])).toBe(3)
  })
  it('collapses wire syndication into one confirmation', () => {
    expect(computeSourceBreadth(['Reuters UK', 'Reuters India', 'reuters.com'])).toBe(1)
  })
  it('returns 0 for no sources', () => {
    expect(computeSourceBreadth([])).toBe(0)
  })
})
