// Weekly curation report: unreviewed domains ranked by how often they appear
// in ingested clusters. A human promotes (tier1/tier2/specialist) or blocks
// each via the DomainReliability table — the trust gate never auto-promotes.
//
// Run: pnpm --filter worker exec tsx scripts/domain-review-report.ts

import 'dotenv/config'
import { prisma } from '@conflictwatch/db'

async function main(): Promise<void> {
  const byTier = await prisma.domainReliability.groupBy({
    by: ['tier'],
    _count: { domain: true },
  })

  console.log('Domain counts by tier:')
  for (const row of byTier.sort((a, b) => b._count.domain - a._count.domain)) {
    console.log(`  ${row.tier.padEnd(12)} ${row._count.domain}`)
  }

  const candidates = await prisma.domainReliability.findMany({
    where: { tier: { in: ['unknown', 'review'] } },
    orderBy: { totalUsageCount: 'desc' },
    take: 50,
    select: { domain: true, tier: true, totalUsageCount: true, lastUpdatedAt: true },
  })

  if (candidates.length === 0) {
    console.log('\nNo domains awaiting review.')
    return
  }

  console.log(`\nTop ${candidates.length} domains awaiting review (by usage):`)
  console.log('usage  tier     last seen   domain')
  for (const c of candidates) {
    console.log(
      `${String(c.totalUsageCount).padStart(5)}  ${c.tier.padEnd(7)} ` +
      `${c.lastUpdatedAt.toISOString().slice(0, 10)}  ${c.domain}`
    )
  }
  console.log(
    '\nPromote with: UPDATE "DomainReliability" SET tier = \'tier2\' WHERE domain = \'...\';\n' +
    'Tier reflects editorial standards, not geography.'
  )
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
