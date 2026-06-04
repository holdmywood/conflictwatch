// Shared keyword→zone mapping used by both worker and web.
// Source of truth. Both consumer packages import from here.

export const REGION_ZONE_MAP: Array<{ keywords: string[]; zone: string }> = [
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
  { keywords: ['nigeria', 'niger delta', 'port harcourt', 'warri', 'benin city', 'west africa', 'ghana', 'côte d\'ivoire', 'ivory coast', 'sierra leone', 'liberia', 'guinea'], zone: 'west-africa' },
  { keywords: ['saudi', 'riyadh', 'jeddah', 'gulf states', 'uae', 'dubai', 'abu dhabi', 'middle east'], zone: 'middle-east' },
  { keywords: ['venezuela', 'caracas', 'maracaibo', 'orinoco'], zone: 'venezuela' },
  { keywords: ['sudan', 'south sudan', 'khartoum', 'juba', 'darfur'], zone: 'sudan' },
]

export function inferZonesFromRegion(region: string, chokepoints: string[] = []): string[] {
  const lower = region.toLowerCase()
  const zones = new Set<string>(chokepoints)
  for (const { keywords, zone } of REGION_ZONE_MAP) {
    if (keywords.some(kw => lower.includes(kw))) {
      zones.add(zone)
    }
  }
  return [...zones]
}
