import { prisma, inferZonesFromRegion } from '@conflictwatch/db'

export { inferZonesFromRegion }

export interface ExposureResult {
  zone: string
  zoneLabel: string
  zoneType: string
  instrument: string
  instrumentLabel: string
  assetClass: string
  linkType: string
  weight: number
  notes: string
}

// Return ExposureLinks for a conflict, ranked by weight descending.
// Takes the conflict's region string + optional EpisodeStore chokepoints.
export async function getExposuresForConflict(
  region: string,
  chokepoints: string[] = [],
): Promise<ExposureResult[]> {
  const zones = inferZonesFromRegion(region, chokepoints)
  if (zones.length === 0) return []

  const links = await prisma.exposureLink.findMany({
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
  return links
}
