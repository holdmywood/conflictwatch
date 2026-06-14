// Recompute threatLevel (and median position) for every conflict under the
// current model. Run after a model change or a bulk data change.
import 'dotenv/config'
import { prisma } from '@conflictwatch/db'
import { recomputeConflictThreat } from '../src/pipeline/persist.js'

async function main(): Promise<void> {
  const conflicts = await prisma.conflict.findMany({ select: { id: true } })
  for (const c of conflicts) await recomputeConflictThreat(c.id).catch(() => {})
  const dist: Record<number, number> = {}
  for (const c of await prisma.conflict.findMany({ select: { threatLevel: true } })) {
    dist[c.threatLevel] = (dist[c.threatLevel] ?? 0) + 1
  }
  console.log(`recomputed ${conflicts.length} conflicts; distribution:`, dist)
  await prisma.$disconnect()
}

main().catch(err => { console.error('fatal:', err); process.exit(1) })
