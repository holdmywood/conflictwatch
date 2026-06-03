interface AssessmentCardProps {
  region: string
  body: string
  confidence: string
  createdAt: string
  usedEventIds: string[]
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   'text-green-400 border-green-400',
  medium: 'text-amber-400 border-amber-400',
  low:    'text-gray-400 border-gray-500',
}

export default function AssessmentCard({
  region,
  body,
  confidence,
  createdAt,
  usedEventIds,
}: AssessmentCardProps) {
  return (
    <div className="border-l-2 border-amber-400 bg-[#111827] rounded-r-lg p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-amber-400 border border-amber-400 px-1.5 py-0.5 rounded">
          AI ASSESSMENT
        </span>
        <span className="text-xs font-mono text-gray-300">{region}</span>
        <span
          className={`text-xs font-mono border rounded px-1.5 py-0.5 ${
            CONFIDENCE_COLORS[confidence] ?? CONFIDENCE_COLORS.low
          }`}
        >
          {confidence}
        </span>
        <span className="text-xs font-mono text-gray-500 ml-auto">
          updated {new Date(createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-sm text-gray-200 leading-relaxed">{body}</p>
      {usedEventIds.length > 0 && (
        <p className="text-xs font-mono text-gray-600">
          Sources: {usedEventIds.join(', ')}
        </p>
      )}
    </div>
  )
}
