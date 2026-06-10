import { describe, it, expect } from 'vitest'
import { computePEscalation } from './probability-model.js'

// model-weights.json does not exist in the repo, so these exercise the
// untrained fallback prior — the configuration production runs today.

const calmFeatures = {
  eventTempo: 1, severitySlope: 0, spreadLocations: 1, sourceBreadth: 2, actorCount: 1,
}

describe('computePEscalation (untrained prior)', () => {
  it('labels the model version as an untrained prior', () => {
    const { modelVersion } = computePEscalation(calmFeatures)
    expect(modelVersion).toContain('prior')
  })

  it('carries an honestly wide ±0.25 interval', () => {
    const { p, ciLow, ciHigh } = computePEscalation(calmFeatures)
    // Clipped at 0/1, so check the unclipped side(s)
    if (p >= 0.25) expect(p - ciLow).toBeCloseTo(0.25, 2)
    if (p <= 0.75) expect(ciHigh - p).toBeCloseTo(0.25, 2)
  })

  it('keeps probabilities and bounds inside [0, 1]', () => {
    const { p, ciLow, ciHigh } = computePEscalation({
      eventTempo: 50, severitySlope: 3, spreadLocations: 20, sourceBreadth: 30, actorCount: 25,
    })
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(1)
    expect(ciLow).toBeGreaterThanOrEqual(0)
    expect(ciHigh).toBeLessThanOrEqual(1)
    expect(ciLow).toBeLessThanOrEqual(p)
    expect(ciHigh).toBeGreaterThanOrEqual(p)
  })
})
