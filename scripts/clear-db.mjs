// Destructive: wipes events, conflicts, and assessments from the database
// pointed to by DATABASE_URL. Dev utility only.
//
// Refuses to run unless CONFIRM_CLEAR_DB=yes is set:
//   CONFIRM_CLEAR_DB=yes node scripts/clear-db.mjs

import { PrismaClient } from '../packages/db/node_modules/@prisma/client/index.js'

if (process.env.CONFIRM_CLEAR_DB !== 'yes') {
  console.error('Refusing to clear the database. Set CONFIRM_CLEAR_DB=yes to proceed.')
  process.exit(1)
}

const p = new PrismaClient()
await p.eventSource.deleteMany()
await p.event.deleteMany()
await p.conflict.deleteMany()
await p.assessment.deleteMany()
console.log('cleared')
await p.$disconnect()
