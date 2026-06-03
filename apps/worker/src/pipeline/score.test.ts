import { describe, it, expect } from 'vitest'
import { scoreThreat, toEventType, scoreConfidence } from './score.js'

describe('scoreThreat', () => {
  it('maps QuadClass 1 (verbal cooperation) to threatLevel 1', () => {
    expect(scoreThreat('1')).toBe(1)
  })
  it('maps QuadClass 2 (material cooperation) to threatLevel 1', () => {
    expect(scoreThreat('2')).toBe(1)
  })
  it('maps QuadClass 3 (verbal conflict) to threatLevel 3', () => {
    expect(scoreThreat('3')).toBe(3)
  })
  it('maps QuadClass 4 (material conflict) to threatLevel 5', () => {
    expect(scoreThreat('4')).toBe(5)
  })
  it('returns 1 for unknown QuadClass', () => {
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
})
