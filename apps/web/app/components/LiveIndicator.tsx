'use client'

import { useEffect, useState } from 'react'

const POLL_INTERVAL_MS = 15_000
const STALE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

function secondsAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function LiveIndicator() {
  const [lastIngestedAt, setLastIngestedAt] = useState<Date | null>(null)
  const [display, setDisplay] = useState('—')
  const [isStale, setIsStale] = useState(false)

  useEffect(() => {
    const poll = () =>
      fetch('/api/heartbeat')
        .then(r => r.json())
        .then(data => {
          if (data.lastIngestedAt) {
            setLastIngestedAt(new Date(data.lastIngestedAt))
          }
        })
        .catch(() => setIsStale(true))

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!lastIngestedAt) return
    const tick = () => {
      setDisplay(secondsAgo(lastIngestedAt))
      setIsStale(Date.now() - lastIngestedAt.getTime() > STALE_THRESHOLD_MS)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [lastIngestedAt])

  const dotColor = isStale ? 'bg-amber-400' : 'bg-green-400'
  const textColor = isStale ? 'text-amber-400' : 'text-green-400'

  return (
    <div className="flex items-center gap-2 font-mono text-xs select-none">
      <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
      <span className={textColor}>LIVE</span>
      {lastIngestedAt && (
        <span className="text-gray-500">updated {display}</span>
      )}
    </div>
  )
}
