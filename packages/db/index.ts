import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export * from '@prisma/client'
export { inferZonesFromRegion, REGION_ZONE_MAP } from './zone-matcher.ts'
export { analogueDistance, ANALOGUE_SCALE, type AnalogueFeatures } from './analogue-distance.ts'
export {
  threatFromEvents,
  eventIntensity,
  recencyWeight,
  HALF_LIFE_MS,
  THREAT_LOOKBACK_MS,
  SUM_THRESHOLDS,
  FATALITY_CAP,
  type ThreatEvent,
} from './threat-model.ts'
