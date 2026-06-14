// One-time: recategorize stored GDELT events that read as ordinary crime/
// accidents (mis-tagged as conflict) to 'other', so they stop feeding threat.
// Curated (UCDP) events are left alone. Recomputes affected conflicts.
//
//   DATABASE_URL="<prod>" pnpm --filter worker exec tsx scripts/retag-ordinary-crime.ts

import 'dotenv/config'
import { prisma } from '@conflictwatch/db'
import { looksLikeOrdinaryCrime } from '../src/lib/ordinary-crime.js'
import { recomputeConflictThreat } from '../src/pipeline/persist.js'

async function main(): Promise<void> {
  const events = await prisma.event.findMany({
    where: { NOT: [{ clusterId: { startsWith: 'ucdp-' } }, { category: 'other' }] },
    select: { id: true, title: true, conflictId: true },
  })
  const hits = events.filter(e => looksLikeOrdinaryCrime(e.title ?? ''))
  console.log(`recategorizing ${hits.length} of ${events.length} GDELT events to 'other':`)
  const touched = new Set<string>()
  for (const e of hits) {
    console.log(`  "${(e.title ?? '').slice(0, 70)}"`)
    await prisma.event.update({ where: { id: e.id }, data: { category: 'other' } })
    if (e.conflictId) touched.add(e.conflictId)
  }
  for (const cId of touched) await recomputeConflictThreat(cId).catch(() => {})
  console.log(`done — recategorized=${hits.length} recomputed=${touched.size} conflicts`)
  await prisma.$disconnect()
}

main().catch(err => { console.error('fatal:', err); process.exit(1) })
