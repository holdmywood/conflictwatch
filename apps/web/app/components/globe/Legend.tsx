'use client'

import type { Lens } from '../../lib/lenses'

/**
 * Globe legend overlay — renders from the same registry as the switcher, so
 * it always matches what is on screen. Empty for pending-source lenses
 * (which show no data and therefore no legend).
 */
export default function Legend({ lens }: { lens: Lens }) {
  if (lens.legend.length === 0) return null

  return (
    <div
      className="absolute bottom-2 left-2 z-10 px-2 py-1.5 border rounded-[2px] select-none"
      style={{ background: 'rgba(22, 21, 17, 0.92)', borderColor: 'var(--border)' }}
      aria-label={`Legend: ${lens.label} lens`}
    >
      <div className="label mb-1">{lens.label}</div>
      <ul className="space-y-0.5">
        {lens.legend.map(entry => (
          <li key={entry.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block shrink-0"
              style={{
                width: 7,
                height: 7,
                background: entry.glyph === 'diamond' ? 'transparent' : entry.color,
                border: entry.glyph === 'diamond' ? `1.5px solid ${entry.color}` : undefined,
                borderRadius: entry.glyph === 'dot' || entry.glyph === 'ring' ? '50%' : 0,
                transform: entry.glyph === 'diamond' ? 'rotate(45deg)' : undefined,
              }}
            />
            <span className="tabnum text-[10px]" style={{ color: 'var(--text-2)' }}>{entry.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
