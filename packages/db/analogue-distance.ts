export type AnalogueFeatures = {
  eventTempo: number
  severitySlope: number
  spreadLocations: number
  sourceBreadth: number
  actorCount: number
}

// Per-feature scale factors normalize each dimension to ~[0,1] range.
// Adjust as operational feature ranges change.
export const ANALOGUE_SCALE: Record<keyof AnalogueFeatures, number> = {
  eventTempo: 1 / 20,
  severitySlope: 1 / 5,
  spreadLocations: 1 / 20,
  sourceBreadth: 1 / 10,
  actorCount: 1 / 20,
}

export function analogueDistance(a: AnalogueFeatures, b: AnalogueFeatures): number {
  return Math.sqrt(
    (Object.keys(ANALOGUE_SCALE) as Array<keyof AnalogueFeatures>).reduce((sum, key) => {
      return sum + Math.pow((a[key] - b[key]) * ANALOGUE_SCALE[key], 2)
    }, 0)
  )
}
