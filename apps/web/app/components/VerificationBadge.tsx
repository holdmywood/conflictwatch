'use client'

import { useState } from 'react'
import { fmtUTC } from '../lib/tokens'
import type { Verification } from '../lib/verification'

const LEVEL_COLORS: Record<Verification['level'], string> = {
  verified: 'var(--ok)',
  'multiple-sources': 'var(--accent)',
  unconfirmed: 'var(--sev-4)',
  rumor: 'var(--down)',
}

/**
 * Verification status chip with an explainable popover. Color is never the
 * only cue — the level label is always rendered. Clicking shows the reasons
 * that produced the classification and the confidence breakdown.
 */
export default function VerificationBadge({ v, showConfidence = true }: { v: Verification; showConfidence?: boolean }) {
  const [open, setOpen] = useState(false)
  const color = LEVEL_COLORS[v.level]

  return (
    <span className="relative inline-flex">
      <button
        onClick={ev => { ev.stopPropagation(); setOpen(o => !o) }}
        aria-expanded={open}
        aria-label={`Verification: ${v.label}, confidence ${v.confidence}%`}
        title={`${v.label} · ${v.confidence}% — click for reasoning`}
        className="inline-flex items-center gap-1 px-1 py-px border rounded-[2px] text-[9.5px] uppercase tracking-[0.05em] whitespace-nowrap"
        style={{ fontFamily: 'var(--font-mono)', color, borderColor: 'var(--border)' }}
      >
        <span aria-hidden className="inline-block w-[5px] h-[5px] rounded-full" style={{ background: color }} />
        {v.label}
        {showConfidence && <span className="tabnum" style={{ color: 'var(--text-3)' }}>{v.confidence}%</span>}
      </button>

      {open && (
        <span
          className="absolute z-30 top-full left-0 mt-1 w-60 px-2.5 py-2 border rounded-[2px] block"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border-strong)' }}
          role="tooltip"
        >
          <span className="label block mb-1">Verification: {v.label}</span>
          <ul className="space-y-0.5 mb-1.5">
            {v.reasons.map((r, i) => (
              <li key={i} className="text-[10px] leading-snug block" style={{ color: 'var(--text-2)' }}>· {r}</li>
            ))}
          </ul>
          <span className="tabnum text-[10px] block" style={{ color: 'var(--text)' }}>
            Confidence {v.confidence}% — {v.confidenceCategory}
          </span>
          <span className="tabnum text-[9.5px] block mt-0.5" style={{ color: 'var(--text-3)' }}>
            as of {fmtUTC(v.updatedAt)} · deterministic scoring, see Methods
          </span>
        </span>
      )}
    </span>
  )
}
