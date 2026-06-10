'use client'

import Link from 'next/link'
import TerminalShell from '../components/TerminalShell'
import Panel from '../components/Panel'

/**
 * Latest News — reading view over AI-summarized, source-tiered items.
 * Ships in Phase 7 of the feature expansion. Until then this page states
 * exactly what it will be and routes the analyst to today's equivalent.
 */
export default function NewsPage() {
  return (
    <TerminalShell>
      <div className="flex-1 min-h-0 p-1.5">
        <Panel title="Latest news">
          <div className="max-w-xl space-y-2">
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text)' }}>
              Reverse-chronological reading view of AI-summarized items with source
              tiers and region/category filters. Not yet wired to a data layer.
            </p>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
              Until this ships, the <Link href="/feed" className="underline">Intel feed</Link> carries
              the same corroborated events with filters, and the{' '}
              <Link href="/report" className="underline">Daily report</Link> carries the
              per-conflict synthesis.
            </p>
          </div>
        </Panel>
      </div>
    </TerminalShell>
  )
}
