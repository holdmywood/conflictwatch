/**
 * Generate public/data/military-airbases.json from OurAirports (public domain).
 *
 * Honesty rules: every entry comes from a public-record dataset, matched as
 * military by NAME evidence only (e.g. "Air Base", "AFB", "Naval Air
 * Station"). We record exactly that — confidence 'medium', operational
 * status 'unknown' — and never invent operators, deployments, or roles.
 * Entries within ~10 km of a curated strategic base are skipped (the curated
 * tier carries the richer, review-flagged metadata).
 *
 * Run: node apps/web/scripts/build-airbases.mjs
 * Source: https://davidmegginson.github.io/ourairports-data/airports.csv
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../public/data/military-airbases.json')
const CSV_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv'

// Name evidence that an airfield is military / military-built. Word-boundary
// anchored to avoid e.g. "Nassau" matching NAS.
const MILITARY_NAME = new RegExp(
  [
    'air force base', 'air force station', 'airforce', '\\bafb\\b', '\\bafs\\b',
    'air base', 'airbase', '\\bab\\b',
    'naval air station', 'naval air facility', 'naval station', '\\bnas\\b', '\\bnaf\\b',
    'marine corps air', '\\bmcas\\b',
    'army air ?field', 'army aviation', '\\baaf\\b',
    'air national guard', 'air reserve', 'joint reserve base', '\\bjrb\\b', 'joint base',
    '\\braf\\b', '\\brafo\\b', '\\brnzaf\\b', '\\braaf\\b', '\\bpaf\\b', '\\bcfb\\b',
    'military', 'air station', 'flygflottilj', 'fliegerhorst', 'heliport militar',
    'base aerea', 'base aérea', 'base aerienne', "base aérienne", 'air weapons range',
  ].join('|'),
  'i'
)

// Disqualifiers: closed fields, water/balloon ports, obvious civil aero clubs
const EXCLUDE_TYPES = new Set(['closed', 'seaplane_base', 'balloonport', 'heliport'])

const CONTINENT_REGION = {
  AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe',
  NA: 'North America', OC: 'Oceania', SA: 'South America',
}

function inferBaseType(name) {
  const n = name.toLowerCase()
  if (/naval|\bnas\b|\bmcas\b|\bnaf\b/.test(n)) return 'naval-air-station'
  if (/army|\baaf\b/.test(n)) return 'army-aviation'
  if (/joint base|\bjrb\b|joint reserve/.test(n)) return 'joint-base'
  if (/international|regional|municipal|civil/.test(n)) return 'dual-use'
  return 'air-force-base'
}

// Minimal CSV parser (handles quoted fields with commas)
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const curated = (() => {
  // Pull lat/lng pairs of the curated tier out of the TS source — keeps the
  // script dependency-free.
  const src = readFileSync(join(__dirname, '../app/lib/military-sites.ts'), 'utf-8')
  const pairs = []
  for (const m of src.matchAll(/lat:\s*(-?\d+(?:\.\d+)?),\s*lng:\s*(-?\d+(?:\.\d+)?)/g)) {
    pairs.push([parseFloat(m[1]), parseFloat(m[2])])
  }
  return pairs
})()

function nearCurated(lat, lng) {
  return curated.some(([clat, clng]) => Math.abs(clat - lat) < 0.1 && Math.abs(clng - lng) < 0.1)
}

const res = await fetch(CSV_URL)
if (!res.ok) throw new Error(`OurAirports fetch failed: ${res.status}`)
const csv = await res.text()
const lines = csv.split('\n')
const header = parseCsvLine(lines[0])
const col = Object.fromEntries(header.map((h, i) => [h.replaceAll('"', ''), i]))

const bases = []
let skippedNearCurated = 0
for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue
  const f = parseCsvLine(lines[i])
  const type = f[col.type]
  if (EXCLUDE_TYPES.has(type)) continue
  const name = f[col.name] ?? ''
  const keywords = f[col.keywords] ?? ''
  // OurAirports flags superseded rows with a literal "[Duplicate]" prefix
  if (name.startsWith('[Duplicate]')) continue
  if (!MILITARY_NAME.test(name) && !MILITARY_NAME.test(keywords)) continue
  const lat = parseFloat(f[col.latitude_deg])
  const lng = parseFloat(f[col.longitude_deg])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
  if (nearCurated(lat, lng)) { skippedNearCurated++; continue }

  bases.push({
    id: `oa-${f[col.id]}`,
    name,
    country: f[col.iso_country] ?? '',
    region: CONTINENT_REGION[f[col.continent]] ?? '',
    lat: Math.round(lat * 1000) / 1000,
    lng: Math.round(lng * 1000) / 1000,
    baseType: inferBaseType(`${name} ${keywords}`),
  })
}

const payload = {
  source: 'OurAirports (public domain), military-named airfields',
  sourceUrl: 'https://ourairports.com/data/',
  generatedAt: new Date().toISOString().slice(0, 10),
  matchBasis: 'name/keyword evidence only — operational status unverified',
  count: bases.length,
  bases,
}

writeFileSync(OUT, JSON.stringify(payload))
console.log(`wrote ${bases.length} bases (${skippedNearCurated} skipped near curated tier) → ${OUT}`)
const byRegion = {}
for (const b of bases) byRegion[b.region] = (byRegion[b.region] ?? 0) + 1
console.log(byRegion)
