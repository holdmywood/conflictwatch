'use client'

import { useEffect, useState } from 'react'
import TerminalShell from '../components/TerminalShell'
import AssessmentCard from '../predictions/components/AssessmentCard'

interface ReportSection {
  id: string
  region: string
  conflictName: string
  body: string
  confidence: string
  createdAt: string
  usedEventIds: string[]
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function ReportPage() {
  const [date, setDate] = useState(todayDateString())
  const [reports, setReports] = useState<ReportSection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch(`/api/report?date=${date}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setReports(d.reports ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [date])

  return (
    <TerminalShell>
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <label className="flex items-center gap-1.5">
          <span className="label">Report date</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="field"
          />
        </label>
        <span className="tabnum text-[10px] ml-auto" style={{ color: 'var(--text-3)' }}>
          {reports.length > 0 && `${reports.length} section${reports.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        <div className="max-w-3xl space-y-1.5">
          {loading && (
            <p className="tabnum text-[11px] p-2" style={{ color: 'var(--text-3)' }}>Loading report…</p>
          )}
          {error && (
            <p className="text-[12px] p-2" style={{ color: 'var(--text-2)' }}>
              Report service unreachable. Change the date or reload to retry.
            </p>
          )}
          {!loading && !error && reports.length === 0 && (
            <p className="text-[12px] p-2" style={{ color: 'var(--text-3)' }}>
              No report for {date}. Reports generate daily after the worker run — pick an earlier date.
            </p>
          )}
          {reports.map(section => (
            <AssessmentCard
              key={section.id}
              region={section.conflictName}
              body={section.body}
              confidence={section.confidence}
              createdAt={section.createdAt}
              usedEventIds={section.usedEventIds}
            />
          ))}
        </div>
      </div>
    </TerminalShell>
  )
}
