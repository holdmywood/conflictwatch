/**
 * Military/state aircraft classifier for ADS-B state vectors.
 *
 * OpenSky anonymous state vectors carry icao24, callsign, and registration
 * country — no operator, type, or registration. Classification therefore
 * rests on two public, well-documented evidence classes:
 *
 *   1. ICAO 24-bit hex allocations reserved for military use (high confidence)
 *   2. Curated military/state callsign prefixes (medium confidence — prefixes
 *      can collide with civilian codes, so they never reach 'high' alone)
 *
 * Anything that matches neither is 'unknown' and is NOT displayed. We never
 * infer "military" from data the source doesn't actually provide; partial
 * coverage is stated in the UI, not papered over.
 *
 * Safety posture: this classifies already-public voluntary broadcasts,
 * delayed and precision-reduced upstream. No route prediction, no tasking,
 * no operational guidance — display only.
 */

export type AircraftClassification = 'military' | 'state' | 'civilian' | 'commercial' | 'unknown'
export type AircraftConfidence = 'high' | 'medium' | 'low'
export type AircraftRole =
  | 'transport'
  | 'tanker'
  | 'fighter'
  | 'bomber'
  | 'isr'
  | 'patrol'
  | 'helicopter'
  | 'trainer'
  | 'uav'
  | 'government'
  | 'unknown-military'

export const AIRCRAFT_ROLES: readonly AircraftRole[] = [
  'transport', 'tanker', 'fighter', 'bomber', 'isr', 'patrol',
  'helicopter', 'trainer', 'uav', 'government', 'unknown-military',
] as const

export interface AircraftVerdict {
  isMilitary: boolean
  classification: AircraftClassification
  role: AircraftRole | null
  confidence: AircraftConfidence
  operator: string | null
  reason: string
}

export interface ClassifiableAircraft {
  icao24: string
  callsign: string
  originCountry?: string
}

/* ── Evidence 1: military ICAO hex allocations (public, documented) ───────── */

interface HexBlock {
  from: number
  to: number
  operator: string
  classification: 'military'
}

// Only blocks that are unambiguously documented as military allocations.
const MILITARY_HEX_BLOCKS: HexBlock[] = [
  // United States military allocation within the US block
  { from: 0xae0000, to: 0xafffff, operator: 'United States military', classification: 'military' },
  // United Kingdom military allocation
  { from: 0x43c000, to: 0x43cfff, operator: 'United Kingdom military', classification: 'military' },
]

/* ── Evidence 2: curated military/state callsign prefixes ─────────────────── */

interface PrefixRule {
  prefix: string
  operator: string
  classification: 'military' | 'state'
  role: AircraftRole
}

// Widely documented, low-collision prefixes only. A prefix match alone is
// medium confidence — never high.
const CALLSIGN_PREFIXES: PrefixRule[] = [
  { prefix: 'RCH', operator: 'US Air Mobility Command', classification: 'military', role: 'transport' },
  { prefix: 'CNV', operator: 'US Navy', classification: 'military', role: 'transport' },
  { prefix: 'PAT', operator: 'US Army', classification: 'military', role: 'transport' },
  { prefix: 'SAM', operator: 'US Special Air Mission', classification: 'state', role: 'government' },
  { prefix: 'AF1', operator: 'US Air Force One', classification: 'state', role: 'government' },
  { prefix: 'AF2', operator: 'US Air Force Two', classification: 'state', role: 'government' },
  { prefix: 'FORTE', operator: 'US Air Force (RQ-4)', classification: 'military', role: 'uav' },
  { prefix: 'NATO', operator: 'NATO (AWACS/AGS)', classification: 'military', role: 'isr' },
  { prefix: 'RRR', operator: 'Royal Air Force', classification: 'military', role: 'transport' },
  { prefix: 'RFR', operator: 'Royal Air Force', classification: 'military', role: 'unknown-military' },
  { prefix: 'ASCOT', operator: 'Royal Air Force', classification: 'military', role: 'transport' },
  { prefix: 'CFC', operator: 'Royal Canadian Air Force', classification: 'military', role: 'transport' },
  { prefix: 'GAF', operator: 'German Air Force', classification: 'military', role: 'transport' },
  { prefix: 'GAM', operator: 'German Army Aviation', classification: 'military', role: 'helicopter' },
  { prefix: 'BAF', operator: 'Belgian Air Force', classification: 'military', role: 'transport' },
  { prefix: 'NAF', operator: 'Royal Netherlands Air Force', classification: 'military', role: 'transport' },
  { prefix: 'PLF', operator: 'Polish Air Force', classification: 'military', role: 'transport' },
  { prefix: 'SVF', operator: 'Swedish Air Force', classification: 'military', role: 'transport' },
  { prefix: 'IAM', operator: 'Italian Air Force', classification: 'military', role: 'transport' },
  { prefix: 'AME', operator: 'Spanish Air Force', classification: 'military', role: 'transport' },
  { prefix: 'FAF', operator: 'French Air and Space Force', classification: 'military', role: 'unknown-military' },
  { prefix: 'CTM', operator: 'French Air Force (COTAM)', classification: 'military', role: 'transport' },
  { prefix: 'ASY', operator: 'Royal Australian Air Force', classification: 'military', role: 'transport' },
  { prefix: 'HKY', operator: 'US Air National Guard', classification: 'military', role: 'transport' },
  { prefix: 'HERKY', operator: 'US Air Force (C-130)', classification: 'military', role: 'transport' },
  { prefix: 'KING', operator: 'US Air Force (HC-130 SAR)', classification: 'military', role: 'patrol' },
  { prefix: 'DUKE', operator: 'US Army', classification: 'military', role: 'unknown-military' },
]

// Sort longest-first so FORTE wins over a hypothetical FOR prefix
const PREFIXES_SORTED = [...CALLSIGN_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length)

/* ── Classifier ───────────────────────────────────────────────────────────── */

export function classifyAircraft(a: ClassifiableAircraft): AircraftVerdict {
  const hex = parseInt(a.icao24, 16)
  if (Number.isFinite(hex)) {
    for (const block of MILITARY_HEX_BLOCKS) {
      if (hex >= block.from && hex <= block.to) {
        // Hex says military; a known callsign prefix can still refine the role
        const rule = matchPrefix(a.callsign)
        return {
          isMilitary: true,
          classification: rule?.classification ?? block.classification,
          role: rule?.role ?? 'unknown-military',
          confidence: 'high',
          operator: rule?.operator ?? block.operator,
          reason: `ICAO hex ${a.icao24} in documented military allocation${rule ? `; callsign ${rule.prefix}` : ''}`,
        }
      }
    }
  }

  const rule = matchPrefix(a.callsign)
  if (rule) {
    return {
      isMilitary: true,
      classification: rule.classification,
      role: rule.role,
      confidence: 'medium',
      operator: rule.operator,
      reason: `Callsign prefix ${rule.prefix} (${rule.operator})`,
    }
  }

  // No military evidence. We cannot distinguish commercial from private GA
  // from the state vector alone, and we don't need to — none of it renders.
  return {
    isMilitary: false,
    classification: 'unknown',
    role: null,
    confidence: 'low',
    operator: null,
    reason: 'No military hex allocation or known military/state callsign',
  }
}

function matchPrefix(callsign: string): PrefixRule | null {
  const cs = callsign.trim().toUpperCase()
  if (!cs) return null
  for (const rule of PREFIXES_SORTED) {
    if (cs.startsWith(rule.prefix)) return rule
  }
  return null
}

/**
 * Display gate: military/state only, never low confidence, unknown hidden.
 * `passesDisplayGate` takes the bare fields so the frontend can re-apply the
 * same gate to API payloads as a guard, even if the server filter failed.
 */
export function passesDisplayGate(a: {
  classification: AircraftClassification
  confidence: AircraftConfidence
}): boolean {
  return (
    (a.classification === 'military' || a.classification === 'state') &&
    (a.confidence === 'high' || a.confidence === 'medium')
  )
}

export function shouldDisplayAircraft(v: AircraftVerdict): boolean {
  return v.isMilitary && passesDisplayGate(v)
}
