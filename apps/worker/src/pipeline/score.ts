const QUADCLASS_THREAT: Record<string, number> = {
  '1': 1,
  '2': 1,
  '3': 3,
  '4': 5,
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

export function scoreThreat(quadClass: string): number {
  return QUADCLASS_THREAT[quadClass] ?? 1
}

export function toEventType(eventRootCode: string): string {
  return ROOT_TO_EVENT_TYPE[eventRootCode] ?? 'other'
}

function canonicalSourceName(raw: string): string {
  const lower = raw.toLowerCase()
  for (const wire of WIRE_AGENCIES) {
    if (lower.includes(wire.trim())) {
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
