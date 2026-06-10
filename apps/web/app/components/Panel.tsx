import type React from 'react'

interface PanelProps {
  title: string
  /** Right-aligned content in the panel header (counts, as-of times, controls). */
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Remove body padding (for tables/maps that bleed to the edge). */
  flush?: boolean
}

export default function Panel({ title, meta, children, className, flush }: PanelProps) {
  return (
    <section className={`panel panel-in ${className ?? ''}`}>
      <header
        className="flex items-center justify-between gap-2 h-7 px-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="panel-title truncate">{title}</h2>
        {meta && <div className="flex items-center gap-2 min-w-0">{meta}</div>}
      </header>
      <div className={`flex-1 min-h-0 ${flush ? '' : 'p-2.5'}`}>{children}</div>
    </section>
  )
}
