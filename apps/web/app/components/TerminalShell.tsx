interface TerminalShellProps {
  sidebar: React.ReactNode
  main: React.ReactNode
  header?: React.ReactNode
}

export default function TerminalShell({ sidebar, main, header }: TerminalShellProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Top nav bar */}
      <nav
        className="flex items-center gap-0 px-4 border-b flex-shrink-0 h-10"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <span className="text-xs font-mono font-bold mr-6" style={{ color: 'var(--accent-amber)' }}>
          CONFLICTWATCH
        </span>
        {[
          { href: '/', label: 'Map' },
          { href: '/feed', label: 'Feed' },
          { href: '/signals', label: 'Signals' },
          { href: '/predictions', label: 'Predictions' },
          { href: '/report', label: 'Report' },
          { href: '/methodology', label: 'Methodology' },
        ].map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className="text-xs font-mono px-3 h-10 flex items-center border-r transition-colors hover:text-white"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
          >
            {label}
          </a>
        ))}
        {header && <div className="ml-auto">{header}</div>}
      </nav>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside
          className="w-60 flex-shrink-0 border-r overflow-y-auto"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {sidebar}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4">
          {main}
        </main>
      </div>
    </div>
  )
}
