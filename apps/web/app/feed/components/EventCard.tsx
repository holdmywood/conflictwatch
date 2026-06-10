import { fmtUTC } from '../../lib/tokens'

interface Source {
  id: string
  name: string
  url: string
}

interface EventCardProps {
  title: string
  actor1?: string | null
  actor2?: string | null
  eventType: string
  confidence: string
  publishedAt: string
  region: string
  sources: Source[]
  sourceCount: number
}

/**
 * One feed row: time, type, confidence, actors/title, region, sources.
 * Rendered as a table row so every column aligns across the feed.
 */
export default function EventCard({
  title,
  actor1,
  actor2,
  eventType,
  confidence,
  publishedAt,
  region,
  sources,
  sourceCount,
}: EventCardProps) {
  const actors = [actor1, actor2].filter(Boolean).join(' · ')
  return (
    <tr className="border-b align-top" style={{ borderColor: 'var(--border)' }}>
      <td className="tabnum text-[10px] pl-3 pr-2 py-2 whitespace-nowrap w-px" style={{ color: 'var(--text-3)' }}>
        {fmtUTC(publishedAt)}
      </td>
      <td className="tabnum text-[10px] uppercase pr-2 py-2 whitespace-nowrap w-px" style={{ color: 'var(--text-2)' }}>
        {eventType}
      </td>
      <td className="tabnum text-[10px] uppercase pr-3 py-2 whitespace-nowrap w-px" style={{ color: 'var(--text-3)' }}>
        {confidence}
      </td>
      <td className="pr-3 py-2 min-w-0">
        {actors && (
          <p className="tabnum text-[10px] mb-0.5" style={{ color: 'var(--text-2)' }}>{actors}</p>
        )}
        <p className="text-[12px] leading-snug" style={{ color: 'var(--text)' }}>{title}</p>
        <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
          {sourceCount} source{sourceCount !== 1 ? 's' : ''}
          {sources.map(src => (
            <span key={src.id}>
              {' · '}
              <a href={src.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--text-2)' }}>
                {src.name}
              </a>
            </span>
          ))}
        </p>
      </td>
      <td className="text-[10px] pr-3 py-2 text-right whitespace-nowrap w-px hidden sm:table-cell" style={{ color: 'var(--text-3)' }}>
        {region}
      </td>
    </tr>
  )
}
