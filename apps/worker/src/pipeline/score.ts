// Threat level by CAMEO root code (1-5 scale)
// Only codes in CONFLICT_CAMEO_ALLOWLIST (17-20) reach this function.
const ROOT_THREAT: Record<string, number> = {
  '17': 3, // coercion
  '18': 4, // assault
  '19': 5, // armed conflict
  '20': 5, // mass violence
}

const ROOT_TO_EVENT_TYPE: Record<string, string> = {
  '1': 'diplomatic',
  '2': 'diplomatic',
  '3': 'diplomatic',
  '4': 'diplomatic',
  '5': 'diplomatic',
  '6': 'cooperation',
  '7': 'cooperation',
  '8': 'dispute',
  '9': 'investigation',
  '10': 'demand',
  '11': 'disapproval',
  '12': 'rejection',
  '13': 'threat',
  '14': 'protest',
  '15': 'posturing',
  '16': 'sanctions',
  '17': 'coercion',
  '18': 'assault',
  '19': 'armed-conflict',
  '20': 'mass-violence',
}

const WIRE_AGENCIES = [
  'reuters',
  'associated press',
  ' ap ',
  'afp',
  'agence france',
  'xinhua',
  'tass',
  'bloomberg',
  'dpa',
  'apa ',
]

export function scoreThreat(eventRootCode: string): number {
  return ROOT_THREAT[eventRootCode] ?? 1
}

export function toEventType(eventRootCode: string): string {
  return ROOT_TO_EVENT_TYPE[eventRootCode] ?? 'other'
}

function canonicalSourceName(raw: string): string {
  const lower = raw.toLowerCase()
  for (const wire of WIRE_AGENCIES) {
    if (lower.includes(wire)) {
      return wire.trim().split(' ')[0]
    }
  }
  return raw.toLowerCase()
}

export function scoreConfidence(sourceNames: string[]): 'low' | 'medium' | 'high' {
  const distinct = new Set(sourceNames.map(canonicalSourceName))
  if (distinct.size >= 3) return 'high'
  if (distinct.size === 2) return 'medium'
  return 'low'
}

// Independent-source count with wire syndication collapsed — the same
// canonicalization scoreConfidence uses, so confidence and breadth agree
// on what counts as "independent".
export function computeSourceBreadth(sourceNames: string[]): number {
  return new Set(sourceNames.map(canonicalSourceName)).size
}
