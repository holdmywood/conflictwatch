import { describe, it, expect } from 'vitest'
import { classifyAircraft, shouldDisplayAircraft, passesDisplayGate } from './aircraft-classify'

const verdictFor = (icao24: string, callsign: string) => classifyAircraft({ icao24, callsign })
const displayed = (icao24: string, callsign: string) => shouldDisplayAircraft(verdictFor(icao24, callsign))

describe('classifyAircraft — military evidence', () => {
  it('classifies US military hex block as military, high confidence', () => {
    const v = verdictFor('ae1234', '')
    expect(v.isMilitary).toBe(true)
    expect(v.classification).toBe('military')
    expect(v.confidence).toBe('high')
    expect(v.reason).toContain('military allocation')
  })

  it('classifies UK military hex block as military, high confidence', () => {
    const v = verdictFor('43c0a1', 'ASCOT41')
    expect(v.isMilitary).toBe(true)
    expect(v.confidence).toBe('high')
  })

  it('refines role from callsign when hex already says military', () => {
    const v = verdictFor('ae0001', 'RCH4109')
    expect(v.role).toBe('transport')
    expect(v.operator).toContain('Mobility')
  })

  it('classifies known military callsign prefixes at medium confidence', () => {
    const v = verdictFor('3c0000', 'GAF891') // German AF callsign on a civilian-block hex
    expect(v.isMilitary).toBe(true)
    expect(v.classification).toBe('military')
    expect(v.confidence).toBe('medium')
    expect(v.role).toBe('transport')
  })

  it('classifies state aircraft (SAM) as state', () => {
    const v = verdictFor('a00001', 'SAM45')
    expect(v.classification).toBe('state')
    expect(v.role).toBe('government')
  })

  it('classifies NATO AWACS callsigns as ISR', () => {
    expect(verdictFor('3c6675', 'NATO05').role).toBe('isr')
  })

  it('classifies FORTE (RQ-4) as UAV', () => {
    expect(verdictFor('ae5c4d', 'FORTE11').role).toBe('uav')
  })
})

describe('display gate — commercial and unknown aircraft are hidden', () => {
  it('hides commercial airliner callsigns', () => {
    expect(displayed('4ca123', 'RYR1234')).toBe(false) // Ryanair
    expect(displayed('a1b2c3', 'UAL12')).toBe(false) // United
    expect(displayed('406a17', 'BAW249')).toBe(false) // British Airways
    expect(displayed('3c66b1', 'DLH400')).toBe(false) // Lufthansa
  })

  it('hides cargo airline callsigns', () => {
    expect(displayed('a8d2f1', 'FDX1306')).toBe(false) // FedEx
    expect(displayed('a44f01', 'GTI8071')).toBe(false) // Atlas Air
  })

  it('hides private/GA aircraft with no callsign', () => {
    expect(displayed('a96d42', '')).toBe(false)
    expect(displayed('3d2a4f', 'DEABC')).toBe(false) // German GA registration callsign
  })

  it('hides unknown aircraft by default', () => {
    const v = verdictFor('789abc', 'XYZ999')
    expect(v.classification).toBe('unknown')
    expect(v.confidence).toBe('low')
    expect(shouldDisplayAircraft(v)).toBe(false)
  })

  it('never displays low-confidence or civilian classifications', () => {
    expect(passesDisplayGate({ classification: 'unknown', confidence: 'high' })).toBe(false)
    expect(passesDisplayGate({ classification: 'commercial', confidence: 'high' })).toBe(false)
    expect(passesDisplayGate({ classification: 'civilian', confidence: 'high' })).toBe(false)
    expect(passesDisplayGate({ classification: 'military', confidence: 'low' })).toBe(false)
  })

  it('displays military and state at high or medium confidence', () => {
    expect(passesDisplayGate({ classification: 'military', confidence: 'high' })).toBe(true)
    expect(passesDisplayGate({ classification: 'military', confidence: 'medium' })).toBe(true)
    expect(passesDisplayGate({ classification: 'state', confidence: 'medium' })).toBe(true)
  })

  it('every verdict carries a reason string', () => {
    expect(verdictFor('ae0001', '').reason).toBeTruthy()
    expect(verdictFor('4ca123', 'RYR1').reason).toBeTruthy()
  })
})
