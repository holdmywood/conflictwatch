import { NextResponse } from 'next/server'
import { prisma } from '@conflictwatch/db'

// Keyword → zone slug mapping (mirrors exposure-matcher.ts in worker)
const REGION_ZONE_MAP: Array<{ keywords: string[]; zone: string }> = [
  { keywords: ['hormuz', 'gulf', 'iran', 'iraq', 'bahrain', 'kuwait', 'abu dhabi', 'qatar', 'oman', 'persian'], zone: 'hormuz' },
  { keywords: ['bab el mandeb', 'bab-el-mandeb', 'yemen', 'houthi', 'red sea', 'aden', 'djibouti', 'eritrea', 'somalia'], zone: 'bab-el-mandeb' },
  { keywords: ['suez', 'egypt', 'sinai', 'north africa'], zone: 'suez' },
  { keywords: ['bosphorus', 'dardanelles', 'turkey', 'türkiye', 'istanbul', 'ankara', 'black sea'], zone: 'bosphorus' },
  { keywords: ['panama', 'central america'], zone: 'panama' },
  { keywords: ['malacca', 'singapore', 'malaysia', 'indonesia', 'straits'], zone: 'malacca' },
  { keywords: ['ukraine', 'kyiv', 'kharkiv', 'odesa', 'zaporizhzhia', 'donetsk', 'luhansk', 'kherson', 'dnipro'], zone: 'ukraine' },
  { keywords: ['russia', 'moscow', 'siberia', 'chechnya', 'dagestan', 'kaliningrad', 'murmansk', 'vladivostok'], zone: 'russia' },
  { keywords: ['taiwan', 'south china sea', 'spratly', 'paracel', 'strait of taiwan'], zone: 'south-china-sea' },
  { keywords: ['congo', 'drc', 'kinshasa', 'bukavu', 'goma', 'ituri', 'kivus'], zone: 'drc' },
  { keywords: ['mali', 'niger', 'burkina', 'mauritania', 'sahel', 'bamako', 'niamey', 'ouagadougou'], zone: 'sahel' },
  { keywords: ['nigeria', 'niger delta', 'port harcourt', 'warri', 'west africa', 'ghana', 'ivory coast', 'sierra leone', 'liberia', 'guinea'], zone: 'west-africa' },
  { keywords: ['saudi', 'riyadh', 'jeddah', 'gulf states', 'uae', 'dubai', 'middle east'], zone: 'middle-east' },
  { keywords: ['venezuela', 'caracas', 'maracaibo', 'orinoco'], zone: 'venezuela' },
  { keywords: ['sudan', 'south sudan', 'khartoum', 'juba', 'darfur'], zone: 'sudan' },
]

function inferZones(region: string, chokepoints: string[]): string[] {
  const lower = region.toLowerCase()
  const zones = new Set<string>(chokepoints)
  for (const { keywords, zone } of REGION_ZONE_MAP) {
    if (keywords.some(kw => lower.includes(kw))) zones.add(zone)
  }
  return [...zones]
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const conflict = await prisma.conflict.findUnique({
    where: { id },
    select: { id: true, region: true },
  })
  if (!conflict) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Also pull chokepoints from the most recent EpisodeStore snapshot
  const latestEpisode = await prisma.episodeStore.findFirst({
    where: { conflictId: id },
    orderBy: { snapshotAt: 'desc' },
    select: { chokepoints: true },
  })
  const chokepoints = latestEpisode?.chokepoints ?? []

  const zones = inferZones(conflict.region, chokepoints)
  if (zones.length === 0) {
    return NextResponse.json({ exposures: [], zones: [] })
  }

  const exposures = await prisma.exposureLink.findMany({
    where: { zone: { in: zones } },
    orderBy: { weight: 'desc' },
    select: {
      zone: true,
      zoneLabel: true,
      zoneType: true,
      instrument: true,
      instrumentLabel: true,
      assetClass: true,
      linkType: true,
      weight: true,
      notes: true,
    },
  })

  return NextResponse.json({ exposures, zones })
}
