/**
 * Single source of truth for the globe's lens system.
 *
 * The switcher, the sub-toggles, and the legend all render from this table —
 * they cannot drift apart. One lens is active at a time; switching swaps the
 * globe's data layers and the legend wholesale. Lenses whose data source is
 * not yet wired carry `status: 'pending-source'` and render a labeled
 * placeholder, never fabricated data.
 */

import { SEV_COLORS, HAZARD_COLOR, OUTBREAK_COLOR, AIRCRAFT_COLOR } from './tokens'

export type LensId = 'conflict' | 'disasters' | 'contamination' | 'tracking'

export interface LegendEntry {
  /** Swatch color (CSS value). */
  color: string
  /** Marker glyph drawn next to the color: dot, ring, diamond, or square. */
  glyph: 'dot' | 'ring' | 'diamond' | 'square'
  label: string
}

export interface SubToggle {
  id: string
  label: string
  defaultOn: boolean
}

export interface Lens {
  id: LensId
  label: string
  /** 'live' renders data; 'pending-source' renders a labeled empty state. */
  status: 'live' | 'pending-source'
  /** Shown in the placeholder for pending lenses — names the real source. */
  plannedSources?: string
  subToggles: SubToggle[]
  legend: LegendEntry[]
}

export const LENSES: readonly Lens[] = [
  {
    id: 'conflict',
    label: 'Conflict',
    status: 'live',
    subToggles: [
      { id: 'events', label: 'Event blips', defaultOn: true },
      { id: 'hotspots', label: 'Hotspots', defaultOn: true },
    ],
    legend: [
      { color: SEV_COLORS[1], glyph: 'dot', label: 'S1 minimal' },
      { color: SEV_COLORS[2], glyph: 'dot', label: 'S2 low' },
      { color: SEV_COLORS[3], glyph: 'dot', label: 'S3 medium' },
      { color: SEV_COLORS[4], glyph: 'dot', label: 'S4 elevated' },
      { color: SEV_COLORS[5], glyph: 'dot', label: 'S5 critical' },
      { color: 'var(--accent)', glyph: 'diamond', label: 'Strategic hotspot' },
    ],
  },
  {
    id: 'disasters',
    label: 'Natural disasters',
    status: 'live',
    subToggles: [
      { id: 'earthquakes', label: 'Earthquakes', defaultOn: true },
      { id: 'volcanoes', label: 'Volcanoes', defaultOn: true },
      { id: 'tsunami', label: 'Tsunami warnings', defaultOn: true },
      { id: 'alerts', label: 'Cyclone/flood alerts', defaultOn: true },
    ],
    legend: [
      { color: HAZARD_COLOR, glyph: 'dot', label: 'Earthquake — size ∝ magnitude' },
      { color: HAZARD_COLOR, glyph: 'square', label: 'Volcano' },
      { color: HAZARD_COLOR, glyph: 'ring', label: 'Tsunami warning' },
      { color: HAZARD_COLOR, glyph: 'diamond', label: 'Cyclone / flood alert' },
      { color: 'var(--down)', glyph: 'ring', label: 'Red alert — pulsing' },
    ],
  },
  {
    id: 'contamination',
    label: 'Contamination',
    status: 'live',
    subToggles: [
      { id: 'outbreaks', label: 'Outbreaks', defaultOn: true },
    ],
    legend: [
      { color: OUTBREAK_COLOR, glyph: 'ring', label: 'Active outbreak (WHO DON)' },
      { color: OUTBREAK_COLOR, glyph: 'dot', label: 'Affected country' },
    ],
  },
  {
    id: 'tracking',
    label: 'Tracking',
    status: 'live',
    subToggles: [
      { id: 'aircraft', label: 'Aircraft (ADS-B)', defaultOn: true },
      { id: 'military-sites', label: 'Military sites', defaultOn: true },
      { id: 'vessels', label: 'Vessels (AIS key)', defaultOn: false },
      { id: 'missile-events', label: 'Missile events', defaultOn: false },
    ],
    legend: [
      { color: AIRCRAFT_COLOR, glyph: 'dot', label: 'Aircraft (ADS-B)' },
      { color: 'var(--accent)', glyph: 'square', label: 'Military site (curated)' },
    ],
  },
] as const

export function getLens(id: LensId): Lens {
  return LENSES.find(l => l.id === id) ?? LENSES[0]
}

export function defaultToggles(lens: Lens): Record<string, boolean> {
  return Object.fromEntries(lens.subToggles.map(t => [t.id, t.defaultOn]))
}
