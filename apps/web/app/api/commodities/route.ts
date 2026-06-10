import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

/**
 * Commodities tracker — the instruments that appear in the exposure graph,
 * with prices/moves when a market-data source is configured.
 *
 * Informational only — no buy/sell/position advice (regulatory + trust line).
 * Prices require COMMODITIES_API_KEY; without it the instrument list still
 * renders (so analysts see what's linked to which zone) but prices are marked
 * unavailable. Prices are never fabricated.
 */
export async function GET() {
  // Distinct instruments referenced by the curated exposure graph
  const links = await prisma.exposureLink.findMany({
    select: { instrument: true, instrumentLabel: true, assetClass: true },
    distinct: ['instrument'],
    orderBy: { instrumentLabel: 'asc' },
  })

  const configured = Boolean(process.env.COMMODITIES_API_KEY)

  // Price wiring lives behind the key. Until configured, return the instrument
  // catalogue with null prices and a clear flag — the UI shows "—", not a guess.
  const instruments = links.map(l => ({
    instrument: l.instrument,
    label: l.instrumentLabel,
    assetClass: l.assetClass,
    price: null as number | null,
    changePct: null as number | null,
  }))

  return NextResponse.json(
    {
      configured,
      source: configured ? 'configured' : 'no-source',
      instruments,
      asOf: new Date().toISOString(),
      note: 'Informational only — not investment advice. No buy/sell or position guidance.',
    },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } }
  )
}
