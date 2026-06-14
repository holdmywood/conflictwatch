// One-time: clear UCDP events so the global backfill can recreate them with
// fatalities populated. Existing UCDP rows have fatalities=0 (the column
// default after the migration), and bulk insert skips duplicate clusterIds, so
// they must be deleted first. GDELT events are untouched.
//
// Run order:
//   tsx scripts/reload-ucdp-fatalities.ts   (this — deletes UCDP events)
//   tsx src/ucdp-backfill.ts                (recreates with `best`)
//   tsx scripts/recompute-all.ts            (relevel under the new model)

import 'dotenv/config'
import { prisma } from '@conflictwatch/db'

async function main(): Promise<void> {
  const host = (process.env.DATABASE_URL ?? '').replace(/:[^:@/]*@/, ':***@').match(/@([^/?:]+)/)?.[1] ?? '?'
  console.log(`[reload] target DB host: ${host}`)

  const ids = await prisma.event.findMany({
    where: { clusterId: { startsWith: 'ucdp-' } },
    select: { id: true },
  })
  console.log(`[reload] deleting ${ids.length} UCDP events and their sources…`)
  const idList = ids.map(e => e.id)
  // Delete sources first (FK), in chunks.
  for (let i = 0; i < idList.length; i += 5000) {
    const chunk = idList.slice(i, i + 5000)
    await prisma.eventSource.deleteMany({ where: { eventId: { in: chunk } } })
    await prisma.event.deleteMany({ where: { id: { in: chunk } } })
  }
  const remaining = await prisma.event.count({ where: { clusterId: { startsWith: 'ucdp-' } } })
  console.log(`[reload] done — remaining UCDP events: ${remaining}`)
  await prisma.$disconnect()
}

main().catch(err => { console.error('[reload] fatal:', err); process.exit(1) })
