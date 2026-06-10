'use client'

import type React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import StatusBar from './StatusBar'

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/signals', label: 'Signals' },
  { href: '/feed', label: 'Feed' },
  { href: '/predictions', label: 'Forecasts' },
  { href: '/report', label: 'Report' },
  { href: '/methodology', label: 'Methods' },
] as const

interface TerminalShellProps {
  /** Optional left rail (watchlist / index). Hidden on small screens. */
  sidebar?: React.ReactNode
  children: React.ReactNode
}

export default function TerminalShell({ sidebar, children }: TerminalShellProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ background: 'var(--ground)' }}>
      <nav
        className="flex items-stretch h-9 border-b shrink-0 overflow-x-auto"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        aria-label="Primary"
      >
        <span
          className="flex items-center px-3 mr-2 text-[12px] font-bold tracking-[0.14em] whitespace-nowrap select-none"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
        >
          CONFLICTWATCH
        </span>
        {NAV.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="relative flex items-center px-3 text-[11px] uppercase tracking-[0.08em] whitespace-nowrap transition-colors"
              style={{
                fontFamily: 'var(--font-mono)',
                color: active ? 'var(--text)' : 'var(--text-3)',
                boxShadow: active ? 'inset 0 -2px 0 var(--accent)' : undefined,
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-1 min-h-0">
        {sidebar && (
          <aside
            className="hidden md:flex flex-col w-60 shrink-0 border-r overflow-y-auto"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {sidebar}
          </aside>
        )}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">{children}</main>
      </div>

      <StatusBar />
    </div>
  )
}
