'use client'

import Link from 'next/link'
import TerminalShell from '../components/TerminalShell'
import Panel from '../components/Panel'

/**
 * Dashboard — global conflict statistics: active conflicts, escalation watch
 * list, top movers, lead-time and coverage metrics. Ships in Phase 8.
 * Until then this page routes to the live equivalents.
 */
export default function DashboardPage() {
  return (
    <TerminalShell>
      <div className="flex-1 min-h-0 p-1.5">
        <Panel title="Dashboard">
          <div className="max-w-xl space-y-2">
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text)' }}>
              Global statistics view — active conflicts, escalation watch list, top
              movers, lead-time and coverage metrics. Not yet wired to a data layer.
            </p>
            <ul className="text-[11px] space-y-1" style={{ color: 'var(--text-2)' }}>
              <li>
                Escalation signals with calibrated probabilities:{' '}
                <Link href="/signals" className="underline">Signals</Link>
              </li>
              <li>
                Model calibration and track record:{' '}
                <Link href="/methodology" className="underline">Methodology</Link>
              </li>
              <li>
                Ingestion health and lead time: status bar, bottom of every page
              </li>
            </ul>
          </div>
        </Panel>
      </div>
    </TerminalShell>
  )
}
