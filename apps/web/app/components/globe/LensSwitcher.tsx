'use client'

import { LENSES, type Lens, type LensId } from '../../lib/lenses'

interface LensSwitcherProps {
  active: LensId
  toggles: Record<string, boolean>
  onLensChange: (id: LensId) => void
  onToggle: (id: string) => void
}

/**
 * Always-visible lens bar: one active lens, its sub-toggles, nothing stacked.
 * Renders entirely from the lens registry.
 */
export default function LensSwitcher({ active, toggles, onLensChange, onToggle }: LensSwitcherProps) {
  const lens: Lens = LENSES.find(l => l.id === active) ?? LENSES[0]

  return (
    <div
      className="flex items-stretch h-8 border-b shrink-0 overflow-x-auto"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <span className="label flex items-center px-2.5 shrink-0" aria-hidden>Lens</span>
      <div role="tablist" aria-label="Globe lens" className="flex items-stretch">
        {LENSES.map(l => {
          const isActive = l.id === active
          return (
            <button
              key={l.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onLensChange(l.id)}
              className="px-2.5 text-[11px] uppercase tracking-[0.06em] whitespace-nowrap transition-colors"
              style={{
                fontFamily: 'var(--font-mono)',
                color: isActive ? 'var(--text)' : 'var(--text-3)',
                boxShadow: isActive ? 'inset 0 -2px 0 var(--accent)' : undefined,
              }}
            >
              {l.label}
              {l.status === 'pending-source' && (
                <span className="ml-1" style={{ color: 'var(--text-3)' }} title="No data source configured">○</span>
              )}
            </button>
          )
        })}
      </div>

      <span className="mx-2 my-1.5 w-px shrink-0" style={{ background: 'var(--border)' }} aria-hidden />

      <div className="flex items-center gap-1 pr-2" aria-label={`${lens.label} layers`}>
        {lens.subToggles.map(t => {
          const on = toggles[t.id] !== false
          return (
            <button
              key={t.id}
              aria-pressed={on}
              onClick={() => onToggle(t.id)}
              className="px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] whitespace-nowrap border rounded-[2px] transition-colors"
              style={{
                fontFamily: 'var(--font-mono)',
                color: on ? 'var(--text)' : 'var(--text-3)',
                borderColor: on ? 'var(--border-strong)' : 'var(--border)',
                background: on ? 'var(--surface-2)' : 'transparent',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
