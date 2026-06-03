'use client'

export interface FeedFilters {
  region: string
  eventType: string
  confidence: string
  from: string
  to: string
}

export const EMPTY_FILTERS: FeedFilters = {
  region: '',
  eventType: '',
  confidence: '',
  from: '',
  to: '',
}

interface FilterBarProps {
  filters: FeedFilters
  onChange: (filters: FeedFilters) => void
}

const EVENT_TYPES = [
  'diplomatic',
  'cooperation',
  'dispute',
  'investigation',
  'demand',
  'disapproval',
  'rejection',
  'threat',
  'protest',
  'posturing',
  'sanctions',
  'coercion',
  'assault',
  'armed-conflict',
  'mass-violence',
  'other',
]

const INPUT_CLS =
  'bg-[#0a0f1a] border border-[#1f2937] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-gray-500'

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const update = (key: keyof FeedFilters, value: string) =>
    onChange({ ...filters, [key]: value })

  const hasFilters =
    filters.region ||
    filters.eventType ||
    filters.confidence ||
    filters.from ||
    filters.to

  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-[#1f2937] bg-[#0d131f]">
      <input
        type="text"
        placeholder="Region…"
        value={filters.region}
        onChange={e => update('region', e.target.value)}
        className={`${INPUT_CLS} w-44 placeholder-gray-500`}
      />

      <select
        value={filters.eventType}
        onChange={e => update('eventType', e.target.value)}
        className={INPUT_CLS}
      >
        <option value="">All types</option>
        {EVENT_TYPES.map(t => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        value={filters.confidence}
        onChange={e => update('confidence', e.target.value)}
        className={INPUT_CLS}
      >
        <option value="">All confidence</option>
        <option value="high">high</option>
        <option value="medium">medium</option>
        <option value="low">low</option>
      </select>

      <input
        type="date"
        value={filters.from}
        onChange={e => update('from', e.target.value)}
        className={INPUT_CLS}
      />
      <span className="text-gray-500 text-sm select-none">→</span>
      <input
        type="date"
        value={filters.to}
        onChange={e => update('to', e.target.value)}
        className={INPUT_CLS}
      />

      {hasFilters && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs text-gray-400 hover:text-white font-mono ml-1"
        >
          clear
        </button>
      )}
    </div>
  )
}
