interface Source {
  id: string
  name: string
  url: string
}

interface EventCardProps {
  title: string
  eventType: string
  confidence: string
  publishedAt: string
  region: string
  sources: Source[]
  sourceCount: number
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   'text-green-400 border-green-400',
  medium: 'text-amber-400 border-amber-400',
  low:    'text-gray-400 border-gray-500',
}

export default function EventCard({
  title,
  eventType,
  confidence,
  publishedAt,
  region,
  sources,
  sourceCount,
}: EventCardProps) {
  return (
    <div className="border border-[#1f2937] rounded-lg p-4 space-y-3 bg-[#111827]">
      <p className="text-sm text-gray-200 leading-snug">{title}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs border rounded px-1.5 py-0.5 font-mono ${
            CONFIDENCE_COLORS[confidence] ?? CONFIDENCE_COLORS.low
          }`}
        >
          {confidence}
        </span>
        <span className="text-xs bg-[#1f2937] text-gray-300 rounded px-1.5 py-0.5 font-mono">
          {eventType}
        </span>
        <span className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{region}</span>
        <span className="text-xs text-gray-500 font-mono ml-auto">
          {new Date(publishedAt).toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-mono">
          {sourceCount} source{sourceCount !== 1 ? 's' : ''}
        </span>
        {sources.map(src => (
          <a
            key={src.id}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline truncate max-w-[150px]"
          >
            {src.name}
          </a>
        ))}
      </div>
    </div>
  )
}
