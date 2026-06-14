// One-time fix for existing GDELT events grouped under the wrong country.
//
// The AI resolved the true location into each event's `region` (e.g. "Belfast,
// United Kingdom") but the event was filed under GDELT's wrong ActionGeo country
// (e.g. Sudan). For high-confidence-location, non-curated events whose region
// country disagrees with their stored conflict, move them to the correct
// `conflict-<fips>` (creating it if needed), then recompute affected conflicts.
//
//   DATABASE_URL="<prod>" pnpm --filter worker exec tsx scripts/reassign-misgeocoded.ts
//   (APPLY=1 to write; default is a dry run)

import 'dotenv/config'
import { prisma } from '@conflictwatch/db'
import { fipsFromRegion, conflictNameFromId } from '../src/lib/fips-countries.js'
import { recomputeConflictThreat, conflictId } from '../src/pipeline/persist.js'

const APPLY = process.env.APPLY === '1'

async function main(): Promise<void> {
  const events = await prisma.event.findMany({
    where: { locationConfidence: 'high', classified: true, NOT: { clusterId: { startsWith: 'ucdp-' } } },
    select: { id: true, region: true, lat: true, lng: true, conflictId: true },
  })

  const moves: { id: string; from: string; to: string; region: string }[] = []
  for (const e of events) {
    const fips = fipsFromRegion(e.region)
    if (!fips) continue
    const target = conflictId(fips)
    if (e.conflictId && target !== e.conflictId) {
      moves.push({ id: e.id, from: e.conflictId, to: target, region: e.region })
    }
  }

  const byRoute = new Map<string, number>()
  for (const m of moves) byRoute.set(`${m.from} → ${m.to}`, (byRoute.get(`${m.from} → ${m.to}`) ?? 0) + 1)
  console.log(`${moves.length} misgeocoded events across ${byRoute.size} routes:`)
  for (const [route, n] of [...byRoute.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${String(n).padStart(4)}  ${route}`)
  }

  if (!APPLY) { console.log('\n(dry run — set APPLY=1 to write)'); await prisma.$disconnect(); return }

  const touched = new Set<string>()
  // Ensure target conflicts exist (named from FIPS), then move events.
  for (const m of moves) {
    const ev = await prisma.event.findUnique({ where: { id: m.id }, select: { lat: true, lng: true, region: true } })
    if (!ev) continue
    await prisma.conflict.upsert({
      where: { id: m.to },
      create: {
        id: m.to,
        name: conflictNameFromId(m.to) ?? m.region.split(',').pop()?.trim() ?? m.to,
        region: m.to.replace('conflict-', '').toUpperCase(),
        status: 'active', threatLevel: 1, lat: ev.lat, lng: ev.lng,
      },
      update: {},
    })
    await prisma.event.update({ where: { id: m.id }, data: { conflictId: m.to } })
    touched.add(m.from)
    touched.add(m.to)
  }

  console.log(`\nmoved ${moves.length} events; recomputing ${touched.size} affected conflicts…`)
  for (const cId of touched) await recomputeConflictThreat(cId).catch(() => {})
  console.log('done')
  await prisma.$disconnect()
}

main().catch(err => { console.error('fatal:', err); process.exit(1) })
