import { sevColor } from '../lib/tokens'

/**
 * Severity mark: colored square + S-numeral. Severity is never conveyed
 * by color alone — the numeral is the primary cue, the color reinforces it.
 */
export default function SevMark({ level, title }: { level: number; title?: string }) {
  const clamped = Math.min(Math.max(level, 1), 5)
  return (
    <span
      className="tabnum inline-flex items-center gap-1 text-[10px] leading-none"
      title={title ?? `Severity ${clamped} of 5`}
    >
      <span
        aria-hidden
        className="inline-block w-[7px] h-[7px]"
        style={{ background: sevColor(clamped) }}
      />
      <span style={{ color: 'var(--text-2)' }}>S{clamped}</span>
    </span>
  )
}
