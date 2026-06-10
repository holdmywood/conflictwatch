'use client'

import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import GlobeGL from 'react-globe.gl'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import countriesTopo from 'world-atlas/countries-110m.json'
import { sevColor } from '../lib/tokens'
import { HOTSPOTS, type Hotspot } from '../lib/hotspots'
import type { LensId } from '../lib/lenses'

export interface ConflictPoint {
  id: string
  name: string
  lat: number
  lng: number
  threatLevel: number
}

export interface EventBlip {
  id: string
  title: string
  lat: number
  lng: number
  severity: number
  publishedAt: string
  sources: Array<{ id: string; name: string; url: string }>
}

export interface CountryFeature {
  name: string
  conflict: ConflictPoint | null
}

interface GlobeProps {
  lens: LensId
  toggles: Record<string, boolean>
  conflicts: ConflictPoint[]
  events: EventBlip[]
  selectedCountryName: string | null
  onSelectCountry: (c: CountryFeature) => void
  onSelectEvent: (e: EventBlip) => void
  onSelectHotspot: (h: Hotspot) => void
  containerWidth?: number
  containerHeight?: number
}

// ── Country polygons (Natural Earth admin-0 via world-atlas) ─────────────────

interface PolyFeature {
  type: 'Feature'
  properties: { name: string }
  geometry: object
}

const COUNTRY_FEATURES: PolyFeature[] = (() => {
  const topo = countriesTopo as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
  const fc = feature(topo, topo.objects.countries) as unknown as { features: PolyFeature[] }
  return fc.features
})()

// Natural Earth names ↔ conflict names derived from GDELT ActionGeo strings.
// GDELT yields plain English short names; NE uses some long forms.
const NE_NAME_TO_GDELT: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'Democratic Republic of the Congo',
  'Central African Rep.': 'Central African Republic',
  'S. Sudan': 'South Sudan',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Czechia': 'Czech Republic',
  'Dominican Rep.': 'Dominican Republic',
  'Eq. Guinea': 'Equatorial Guinea',
  "Côte d'Ivoire": 'Ivory Coast',
  'Myanmar': 'Burma',
  'North Korea': 'North Korea',
  'South Korea': 'South Korea',
}

function gdeltName(neName: string): string {
  return NE_NAME_TO_GDELT[neName] ?? neName
}

// ── Admin-1 borders, lazy-loaded on zoom ─────────────────────────────────────
// Natural Earth 50m admin-1 boundary lines (~4 MB) — fetched once, only when
// the camera first crosses the zoom threshold.

const ADMIN1_URL =
  'https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/50m/cultural/ne_50m_admin_1_states_provinces_lines.json'
const ADMIN1_ALTITUDE_THRESHOLD = 0.85

type PathCoords = Array<[number, number]>

function geoJsonToPaths(geojson: {
  features: Array<{ geometry: { type: string; coordinates: unknown } }>
}): PathCoords[] {
  const paths: PathCoords[] = []
  for (const f of geojson.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'LineString') {
      paths.push((g.coordinates as Array<[number, number]>).map(([lng, lat]) => [lat, lng]))
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates as Array<Array<[number, number]>>) {
        paths.push(line.map(([lng, lat]) => [lat, lng]))
      }
    }
  }
  return paths
}

// ── Markers ──────────────────────────────────────────────────────────────────

function eventLabel(e: EventBlip): string {
  return `<div style="background:#1c1a15;border:1px solid #3d3930;padding:4px 8px;max-width:280px;font-family:var(--font-mono),monospace;font-size:11px;color:#e8e5dc">
    ${e.title}<br/><span style="color:#a39e91">S${e.severity} · ${e.publishedAt.slice(0, 16).replace('T', ' ')}Z</span>
  </div>`
}

function makeHotspotEl(h: Hotspot, onClick: (h: Hotspot) => void): HTMLElement {
  // globe.gl positions the outer element via transform — the rotation must
  // live on an inner element or it gets clobbered.
  const el = document.createElement('button')
  el.setAttribute('aria-label', `Hotspot: ${h.label}`)
  el.title = h.label
  el.style.cssText = 'background:transparent;border:0;padding:2px;cursor:pointer;pointer-events:auto'
  const inner = document.createElement('span')
  inner.style.cssText =
    'display:block;width:11px;height:11px;transform:rotate(45deg);' +
    'border:1.5px solid var(--accent);box-shadow:0 0 0 1px rgba(0,0,0,0.55)'
  el.appendChild(inner)
  el.onclick = ev => { ev.stopPropagation(); onClick(h) }
  return el
}

export default function Globe({
  lens, toggles, conflicts, events, selectedCountryName,
  onSelectCountry, onSelectEvent, onSelectHotspot,
  containerWidth, containerHeight,
}: GlobeProps) {
  const globeRef = useRef<any>(null)
  const [winDims, setWinDims] = useState({ width: 1920, height: 1080 })
  const [hoverPoly, setHoverPoly] = useState<object | null>(null)
  const [admin1Paths, setAdmin1Paths] = useState<PathCoords[]>([])
  const admin1Requested = useRef(false)

  useEffect(() => {
    if (containerWidth !== undefined) return
    const update = () => setWinDims({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [containerWidth])

  const dimensions = {
    width: containerWidth ?? winDims.width,
    height: containerHeight ?? winDims.height,
  }

  // Camera setup: inertial damping, zoom caps so the 4k texture never
  // degrades into visible pixels, gentle auto-rotate unless reduced motion.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    globe.pointOfView({ lat: 20, lng: 10, altitude: 2.2 }, reduceMotion ? 0 : 1000)
    const controls = globe.controls()
    controls.autoRotate = !reduceMotion
    controls.autoRotateSpeed = 0.25
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 130 // altitude ~0.30 — texture stays crisp
    controls.maxDistance = 480
    controls.zoomSpeed = 0.6

    // Lazy admin-1 borders on first close zoom
    const onChange = () => {
      if (admin1Requested.current) return
      const altitude = globe.pointOfView().altitude
      if (altitude < ADMIN1_ALTITUDE_THRESHOLD) {
        admin1Requested.current = true
        fetch(ADMIN1_URL)
          .then(r => (r.ok ? r.json() : Promise.reject()))
          .then(geojson => setAdmin1Paths(geoJsonToPaths(geojson)))
          .catch(() => { admin1Requested.current = false })
      }
    }
    controls.addEventListener('change', onChange)
    return () => controls.removeEventListener('change', onChange)
  }, [])

  const conflictByCountryName = useMemo(() => {
    const map = new Map<string, ConflictPoint>()
    for (const c of conflicts) map.set(c.name.toLowerCase(), c)
    return map
  }, [conflicts])

  const resolveConflict = useCallback(
    (poly: object): ConflictPoint | null => {
      const name = gdeltName((poly as PolyFeature).properties.name)
      return conflictByCountryName.get(name.toLowerCase()) ?? null
    },
    [conflictByCountryName]
  )

  const handlePolygonClick = useCallback(
    (poly: object | null) => {
      if (!poly) return
      const globe = globeRef.current
      if (globe) globe.controls().autoRotate = false
      onSelectCountry({
        name: gdeltName((poly as PolyFeature).properties.name),
        conflict: resolveConflict(poly),
      })
    },
    [onSelectCountry, resolveConflict]
  )

  const handleEventClick = useCallback(
    (point: object) => {
      const blip = point as EventBlip
      const globe = globeRef.current
      if (globe) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        globe.controls().autoRotate = false
        globe.pointOfView({ lat: blip.lat, lng: blip.lng, altitude: 1.2 }, reduceMotion ? 0 : 700)
      }
      onSelectEvent(blip)
    },
    [onSelectEvent]
  )

  // ── Lens-scoped data layers (never stacked across lenses) ──────────────────
  const isConflictLens = lens === 'conflict'
  const showEvents = isConflictLens && toggles['events'] !== false
  const showHotspots = isConflictLens && toggles['hotspots'] !== false

  const eventPoints = showEvents ? events : []
  // Pulse rings only for high-severity events — restraint over spectacle
  const ringEvents = useMemo(
    () => (showEvents ? events.filter(e => e.severity >= 4) : []),
    [events, showEvents]
  )
  const hotspotData = showHotspots ? (HOTSPOTS as unknown as Hotspot[]) : []

  const polygonCapColor = useCallback(
    (poly: object) => {
      const isHover = poly === hoverPoly
      const isSelected =
        selectedCountryName !== null &&
        gdeltName((poly as PolyFeature).properties.name) === selectedCountryName
      const conflict = isConflictLens ? resolveConflict(poly) : null
      if (isSelected) return 'rgba(200, 162, 74, 0.28)'
      if (isHover) return 'rgba(232, 229, 220, 0.14)'
      if (conflict && conflict.threatLevel >= 2) {
        const alpha = 0.10 + conflict.threatLevel * 0.05
        return `${sevColor(conflict.threatLevel)}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
      }
      return 'rgba(0,0,0,0)'
    },
    [hoverPoly, selectedCountryName, isConflictLens, resolveConflict]
  )

  return (
    <GlobeGL
      ref={globeRef}
      width={dimensions.width}
      height={dimensions.height}
      backgroundColor="#100f0d"
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
      bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
      showAtmosphere
      atmosphereColor="#5a6b7a"
      atmosphereAltitude={0.12}
      /* Country polygons — every country clickable */
      polygonsData={COUNTRY_FEATURES}
      polygonGeoJsonGeometry={(d: object) => (d as PolyFeature).geometry as never}
      polygonCapColor={polygonCapColor}
      polygonSideColor={() => 'rgba(0,0,0,0)'}
      polygonStrokeColor={() => 'rgba(232, 229, 220, 0.30)'}
      polygonAltitude={0.004}
      polygonsTransitionDuration={0}
      onPolygonHover={(poly: object | null) => setHoverPoly(poly)}
      onPolygonClick={handlePolygonClick}
      /* Admin-1 boundary lines, revealed on zoom */
      pathsData={admin1Paths}
      pathPoints={(p: object) => p as never}
      pathPointLat={(c: [number, number]) => c[0]}
      pathPointLng={(c: [number, number]) => c[1]}
      pathColor={() => 'rgba(232, 229, 220, 0.16)'}
      pathStroke={0.4}
      pathPointAlt={() => 0.0045}
      pathTransitionDuration={0}
      /* Event blips — severity channel */
      pointsData={eventPoints}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d: object) => sevColor((d as EventBlip).severity)}
      pointRadius={(d: object) => 0.22 + (d as EventBlip).severity * 0.07}
      pointAltitude={0.012}
      pointLabel={(d: object) => eventLabel(d as EventBlip)}
      onPointClick={handleEventClick}
      /* Pulse rings for S4+ only */
      ringsData={ringEvents}
      ringLat="lat"
      ringLng="lng"
      ringColor={(d: object) => () => sevColor((d as EventBlip).severity)}
      ringMaxRadius={3.2}
      ringPropagationSpeed={1.4}
      ringRepeatPeriod={1800}
      ringAltitude={0.013}
      /* Strategic hotspots — distinct diamond markers */
      htmlElementsData={hotspotData}
      htmlLat="lat"
      htmlLng="lng"
      htmlAltitude={0.015}
      htmlElement={(d: object) => makeHotspotEl(d as Hotspot, onSelectHotspot)}
    />
  )
}
