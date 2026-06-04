import 'dotenv/config'
import { prisma } from './index.js'

const LINKS = [
  // Strait of Hormuz — ~20% global oil, ~30% LNG trade
  { zone: 'hormuz', zoneLabel: 'Strait of Hormuz', zoneType: 'chokepoint', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'transit', weight: 0.90, notes: '~20% of global oil trade transits daily' },
  { zone: 'hormuz', zoneLabel: 'Strait of Hormuz', zoneType: 'chokepoint', instrument: 'ttf', instrumentLabel: 'TTF Gas', assetClass: 'energy', linkType: 'transit', weight: 0.85, notes: 'Qatar LNG, key Asian supply route' },
  { zone: 'hormuz', zoneLabel: 'Strait of Hormuz', zoneType: 'chokepoint', instrument: 'gasoil', instrumentLabel: 'Gasoil / Diesel', assetClass: 'energy', linkType: 'transit', weight: 0.70, notes: '' },
  // Bab-el-Mandeb / Red Sea
  { zone: 'bab-el-mandeb', zoneLabel: 'Bab-el-Mandeb / Red Sea', zoneType: 'chokepoint', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'transit', weight: 0.75, notes: '~10% of global oil on this route; Houthi attacks rerouted shipping 2024' },
  { zone: 'bab-el-mandeb', zoneLabel: 'Bab-el-Mandeb / Red Sea', zoneType: 'chokepoint', instrument: 'container-freight', instrumentLabel: 'Container Freight (SCFI)', assetClass: 'shipping', linkType: 'transit', weight: 0.80, notes: '~15% of global container trade; Suez dependency' },
  { zone: 'bab-el-mandeb', zoneLabel: 'Bab-el-Mandeb / Red Sea', zoneType: 'chokepoint', instrument: 'ttf', instrumentLabel: 'TTF Gas', assetClass: 'energy', linkType: 'transit', weight: 0.55, notes: '' },
  // Suez Canal
  { zone: 'suez', zoneLabel: 'Suez Canal', zoneType: 'chokepoint', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'transit', weight: 0.70, notes: '' },
  { zone: 'suez', zoneLabel: 'Suez Canal', zoneType: 'chokepoint', instrument: 'container-freight', instrumentLabel: 'Container Freight (SCFI)', assetClass: 'shipping', linkType: 'transit', weight: 0.90, notes: '~30% of global container trade' },
  { zone: 'suez', zoneLabel: 'Suez Canal', zoneType: 'chokepoint', instrument: 'ttf', instrumentLabel: 'TTF Gas', assetClass: 'energy', linkType: 'transit', weight: 0.60, notes: '' },
  // Bosphorus / Turkish Straits
  { zone: 'bosphorus', zoneLabel: 'Bosphorus / Turkish Straits', zoneType: 'chokepoint', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'transit', weight: 0.65, notes: 'Russian Black Sea oil exports' },
  { zone: 'bosphorus', zoneLabel: 'Bosphorus / Turkish Straits', zoneType: 'chokepoint', instrument: 'wheat', instrumentLabel: 'CBOT Wheat', assetClass: 'agriculture', linkType: 'transit', weight: 0.50, notes: 'Ukraine/Russia grain export route' },
  // Panama Canal
  { zone: 'panama', zoneLabel: 'Panama Canal', zoneType: 'chokepoint', instrument: 'container-freight', instrumentLabel: 'Container Freight (SCFI)', assetClass: 'shipping', linkType: 'transit', weight: 0.75, notes: '' },
  { zone: 'panama', zoneLabel: 'Panama Canal', zoneType: 'chokepoint', instrument: 'ttf', instrumentLabel: 'TTF Gas', assetClass: 'energy', linkType: 'transit', weight: 0.60, notes: 'US LNG exports to Asia' },
  { zone: 'panama', zoneLabel: 'Panama Canal', zoneType: 'chokepoint', instrument: 'grain', instrumentLabel: 'US Grain (Corn/Soy)', assetClass: 'agriculture', linkType: 'transit', weight: 0.50, notes: '' },
  // Strait of Malacca
  { zone: 'malacca', zoneLabel: 'Strait of Malacca', zoneType: 'chokepoint', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'transit', weight: 0.80, notes: '~25% of global oil to Asia-Pacific' },
  { zone: 'malacca', zoneLabel: 'Strait of Malacca', zoneType: 'chokepoint', instrument: 'container-freight', instrumentLabel: 'Container Freight (SCFI)', assetClass: 'shipping', linkType: 'transit', weight: 0.70, notes: '' },
  { zone: 'malacca', zoneLabel: 'Strait of Malacca', zoneType: 'chokepoint', instrument: 'ttf', instrumentLabel: 'TTF Gas', assetClass: 'energy', linkType: 'transit', weight: 0.75, notes: '' },
  // Ukraine — commodity production
  { zone: 'ukraine', zoneLabel: 'Ukraine', zoneType: 'commodity_region', instrument: 'wheat', instrumentLabel: 'CBOT Wheat', assetClass: 'agriculture', linkType: 'production', weight: 0.90, notes: '~10% of global wheat exports' },
  { zone: 'ukraine', zoneLabel: 'Ukraine', zoneType: 'commodity_region', instrument: 'corn', instrumentLabel: 'CBOT Corn', assetClass: 'agriculture', linkType: 'production', weight: 0.80, notes: '~16% of global corn exports' },
  { zone: 'ukraine', zoneLabel: 'Ukraine', zoneType: 'commodity_region', instrument: 'sunflower-oil', instrumentLabel: 'Sunflower Oil', assetClass: 'agriculture', linkType: 'production', weight: 0.95, notes: '~45% of global sunflower oil exports' },
  { zone: 'ukraine', zoneLabel: 'Ukraine', zoneType: 'commodity_region', instrument: 'fertilizers', instrumentLabel: 'Fertilizers (Urea)', assetClass: 'agriculture', linkType: 'substitute', weight: 0.60, notes: '' },
  // Russia
  { zone: 'russia', zoneLabel: 'Russia', zoneType: 'commodity_region', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'production', weight: 0.80, notes: '~10% of global oil production' },
  { zone: 'russia', zoneLabel: 'Russia', zoneType: 'commodity_region', instrument: 'ttf', instrumentLabel: 'TTF Gas', assetClass: 'energy', linkType: 'production', weight: 0.90, notes: 'Pre-2022 ~40% of EU gas supply' },
  { zone: 'russia', zoneLabel: 'Russia', zoneType: 'commodity_region', instrument: 'wheat', instrumentLabel: 'CBOT Wheat', assetClass: 'agriculture', linkType: 'production', weight: 0.65, notes: '~15% of global wheat exports' },
  { zone: 'russia', zoneLabel: 'Russia', zoneType: 'commodity_region', instrument: 'fertilizers', instrumentLabel: 'Fertilizers (Urea)', assetClass: 'agriculture', linkType: 'production', weight: 0.60, notes: '' },
  { zone: 'russia', zoneLabel: 'Russia', zoneType: 'commodity_region', instrument: 'palladium', instrumentLabel: 'Palladium', assetClass: 'metals', linkType: 'production', weight: 0.75, notes: '~40% of global palladium supply' },
  // Middle East / Persian Gulf
  { zone: 'middle-east', zoneLabel: 'Middle East / Persian Gulf', zoneType: 'commodity_region', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'production', weight: 0.90, notes: 'OPEC+ swing producer' },
  { zone: 'middle-east', zoneLabel: 'Middle East / Persian Gulf', zoneType: 'commodity_region', instrument: 'ttf', instrumentLabel: 'TTF Gas', assetClass: 'energy', linkType: 'production', weight: 0.70, notes: '' },
  // South China Sea / Taiwan
  { zone: 'south-china-sea', zoneLabel: 'South China Sea / Taiwan Strait', zoneType: 'chokepoint', instrument: 'container-freight', instrumentLabel: 'Container Freight (SCFI)', assetClass: 'shipping', linkType: 'transit', weight: 0.65, notes: '~30% of global maritime trade' },
  { zone: 'south-china-sea', zoneLabel: 'South China Sea / Taiwan Strait', zoneType: 'chokepoint', instrument: 'semiconductors', instrumentLabel: 'Semiconductor Supply', assetClass: 'technology', linkType: 'production', weight: 0.85, notes: 'TSMC ~90% of advanced logic chips' },
  { zone: 'south-china-sea', zoneLabel: 'South China Sea / Taiwan Strait', zoneType: 'chokepoint', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'transit', weight: 0.50, notes: '' },
  // DRC / Congo Basin — critical minerals
  { zone: 'drc', zoneLabel: 'DR Congo / Central Africa', zoneType: 'commodity_region', instrument: 'cobalt', instrumentLabel: 'Cobalt', assetClass: 'metals', linkType: 'production', weight: 0.90, notes: '~70% of global cobalt supply' },
  { zone: 'drc', zoneLabel: 'DR Congo / Central Africa', zoneType: 'commodity_region', instrument: 'coltan', instrumentLabel: 'Coltan (Tantalum)', assetClass: 'metals', linkType: 'production', weight: 0.85, notes: '' },
  { zone: 'drc', zoneLabel: 'DR Congo / Central Africa', zoneType: 'commodity_region', instrument: 'gold', instrumentLabel: 'Gold', assetClass: 'metals', linkType: 'production', weight: 0.50, notes: '' },
  // Sahel / West Africa
  { zone: 'sahel', zoneLabel: 'Sahel / West Africa', zoneType: 'commodity_region', instrument: 'uranium', instrumentLabel: 'Uranium', assetClass: 'energy', linkType: 'production', weight: 0.70, notes: 'Niger ~5% of global uranium; instability affects French nuclear supply' },
  { zone: 'sahel', zoneLabel: 'Sahel / West Africa', zoneType: 'commodity_region', instrument: 'gold', instrumentLabel: 'Gold', assetClass: 'metals', linkType: 'production', weight: 0.45, notes: '' },
  { zone: 'west-africa', zoneLabel: 'West Africa / Niger Delta', zoneType: 'commodity_region', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'production', weight: 0.60, notes: 'Nigeria ~2% of global oil; Bonny Light quality premium' },
  // Venezuela
  { zone: 'venezuela', zoneLabel: 'Venezuela', zoneType: 'commodity_region', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'production', weight: 0.50, notes: '' },
  { zone: 'venezuela', zoneLabel: 'Venezuela', zoneType: 'commodity_region', instrument: 'heavy-crude', instrumentLabel: 'Heavy Crude (WTI-HD)', assetClass: 'energy', linkType: 'production', weight: 0.65, notes: '' },
  // Sudan / South Sudan
  { zone: 'sudan', zoneLabel: 'Sudan / South Sudan', zoneType: 'commodity_region', instrument: 'brent', instrumentLabel: 'Brent Crude', assetClass: 'energy', linkType: 'production', weight: 0.35, notes: '' },
  { zone: 'sudan', zoneLabel: 'Sudan / South Sudan', zoneType: 'commodity_region', instrument: 'gold', instrumentLabel: 'Gold', assetClass: 'metals', linkType: 'production', weight: 0.50, notes: '' },
]

async function main() {
  console.log('[seed-exposures] Seeding ExposureLink table...')
  // Upsert by zone+instrument (idempotent)
  let created = 0
  let skipped = 0
  for (const link of LINKS) {
    const existing = await prisma.exposureLink.findFirst({
      where: { zone: link.zone, instrument: link.instrument },
    })
    if (existing) { skipped++; continue }
    await prisma.exposureLink.create({ data: link })
    created++
  }
  console.log(`[seed-exposures] Done: ${created} created, ${skipped} already existed`)
  await prisma.$disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
