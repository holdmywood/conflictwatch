import { fmtUTC } from '../../lib/tokens'

interface AssessmentCardProps {
  region: string
  body: string
  confidence: string
  createdAt: string
  usedEventIds: string[]
}

/**
 * Model-written narrative assessment. Marked as model output;
 * confidence is a label, never a color alone.
 */
export default function AssessmentCard({
  region,
  body,
  confidence,
  createdAt,
  usedEventIds,
}: AssessmentCardProps) {
  return (
    <article className="panel panel-in">
      <header
        className="flex items-baseline gap-3 px-3 py-2 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3 className="text-[13px] font-semibold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
          {region}
        </h3>
        <span className="tabnum text-[10px] uppercase shrink-0" style={{ color: 'var(--text-2)' }}>
          conf {confidence} · {usedEventIds.length} events
        </span>
        <span className="tabnum text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-3)' }}>
          {fmtUTC(createdAt)}
        </span>
      </header>
      <div className="px-3 py-2.5">
        <p className="text-[12.5px] leading-relaxed max-w-[68ch]" style={{ color: 'var(--text)' }}>{body}</p>
        <p className="tabnum text-[10px] mt-2" style={{ color: 'var(--text-3)' }}>
          Model assessment · {usedEventIds.length} input event{usedEventIds.length !== 1 ? 's' : ''}
        </p>
      </div>
    </article>
  )
}
