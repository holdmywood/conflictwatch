// One-time: strip stale AI narratives that describe events since reassigned to
// another country. The events moved (corrected-country grouping); these cached
// situation lines / prediction assessments did not. Country-aware: a narrative
// is purged only from conflicts whose country does NOT match the event's true
// country (so the UK keeps its real Belfast text, Pakistan keeps Chakwal, etc.).
// Zero tokens — the live assessor regenerates correct narratives on its cycle.
//
//   DATABASE_URL="<prod>" pnpm --filter worker exec tsx scripts/purge-misattributed-narratives.ts

import 'dotenv/config'
import { prisma } from '@conflictwatch/db'

// Each signature: text that belongs to exactly one country (FIPS). Seen in the
// misgeocoded set that was reassigned.
const SIGNATURES: { re: RegExp; fips: string }[] = [
  { re: /belfast|anti-racism|asylum policy|knife attack|far-right/i, fips: 'UK' },
  { re: /chakwal|australian girl/i, fips: 'PK' },
]
const fipsOf = (conflictId: string) => conflictId.replace(/^conflict-/, '').toUpperCase()

async function main(): Promise<void> {
  let clearedLines = 0
  let deletedPreds = 0

  const conflicts = await prisma.conflict.findMany({ select: { id: true, currentSituationLine: true } })
  for (const c of conflicts) {
    const cf = fipsOf(c.id)
    const line = c.currentSituationLine ?? ''
    if (line && SIGNATURES.some(s => s.re.test(line) && s.fips !== cf)) {
      await prisma.conflict.update({ where: { id: c.id }, data: { currentSituationLine: '', situationStatus: '' } })
      clearedLines++
      console.log(`  cleared situation line: ${c.id}`)
    }
  }

  const preds = await prisma.assessment.findMany({ where: { kind: 'prediction' }, select: { id: true, region: true, body: true } })
  for (const p of preds) {
    const cf = fipsOf(p.region)
    if (p.body && SIGNATURES.some(s => s.re.test(p.body) && s.fips !== cf)) {
      await prisma.assessment.delete({ where: { id: p.id } })
      deletedPreds++
      console.log(`  deleted misattributed prediction: ${p.region}`)
    }
  }

  console.log(`done — clearedLines=${clearedLines} deletedPredictions=${deletedPreds}`)
  await prisma.$disconnect()
}

main().catch(err => { console.error('fatal:', err); process.exit(1) })
