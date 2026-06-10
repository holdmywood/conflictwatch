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
    <div
      className="flex items-center gap-2 flex-wrap px-3 py-2 border-b shrink-0"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <label className="flex items-center gap-1.5">
        <span className="label">Region</span>
        <input
          type="text"
          placeholder="any"
          value={filters.region}
          onChange={e => update('region', e.target.value)}
          className="field w-36"
        />
      </label>

      <label className="flex items-center gap-1.5">
        <span className="label">Type</span>
        <select
          value={filters.eventType}
          onChange={e => update('eventType', e.target.value)}
          className="field"
        >
          <option value="">any</option>
          {EVENT_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="label">Confidence</span>
        <select
          value={filters.confidence}
          onChange={e => update('confidence', e.target.value)}
          className="field"
        >
          <option value="">any</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="label">From</span>
        <input
          type="date"
          value={filters.from}
          onChange={e => update('from', e.target.value)}
          className="field"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="label">To</span>
        <input
          type="date"
          value={filters.to}
          onChange={e => update('to', e.target.value)}
          className="field"
        />
      </label>

      {hasFilters && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="tabnum text-[10px] uppercase tracking-[0.08em] px-2 py-1 border transition-colors hover:border-[var(--border-strong)]"
          style={{ color: 'var(--text-2)', borderColor: 'var(--border)' }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
