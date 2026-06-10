'use client'

import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import GlobeGL from 'react-globe.gl'
import { sevColor, HAZARD_COLOR, OUTBREAK_COLOR } from '../lib/tokens'
import { HOTSPOTS, type Hotspot } from '../lib/hotspots'
import { COUNTRY_FEATURES, toNeName, type CountryPolyFeature } from '../lib/countries'
import type { LensId } from '../lib/lenses'

export interface HazardPoint {
  id: string
  kind: 'earthquake' | 'volcano' | 'tsunami' | 'alert'
  title: string
  lat: number
  lng: number
  magnitude: number | null
  alertLevel: 'green' | 'orange' | 'red' | null
  time: string
  url: string
  source: string
}

export interface Outbreak {
  id: string
  disease: string
  countries: string[]
  points: Array<{ country: string; lat: number; lng: number }>
  title: string
  publishedAt: string
  url: string
  source: string
}

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
  hazards: HazardPoint[]
  outbreaks: Outbreak[]
  /** Conflict per Natural Earth country name — bound by point-in-polygon upstream. */
  conflictByNeName: Map<string, ConflictPoint>
  selectedCountryName: string | null
  onSelectCountry: (c: CountryFeature) => void
  onSelectEvent: (e: EventBlip) => void
  onSelectHotspot: (h: Hotspot) => void
  onSelectHazard: (h: HazardPoint) => void
  onSelectOutbreak: (o: Outbreak) => void
  containerWidth?: number
  containerHeight?: number
}

type PolyFeature = CountryPolyFeature

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

function tooltip(title: string, sub: string): string {
  return `<div style="background:#1c1a15;border:1px solid #3d3930;padding:4px 8px;max-width:280px;font-family:var(--font-mono),monospace;font-size:11px;color:#e8e5dc">
    ${title}<br/><span style="color:#a39e91">${sub}</span>
  </div>`
}

/** Unified marker datum so point/ring layers stay lens-agnostic. */
interface Marker {
  lat: number
  lng: number
  color: string
  radius: number
  label: string
  onClick: () => void
  flyTo: boolean
}

function eventMarker(e: EventBlip, onSelect: (e: EventBlip) => void): Marker {
  return {
    lat: e.lat,
    lng: e.lng,
    color: sevColor(e.severity),
    radius: 0.22 + e.severity * 0.07,
    label: tooltip(e.title, `S${e.severity} · ${e.publishedAt.slice(0, 16).replace('T', ' ')}Z`),
    onClick: () => onSelect(e),
    flyTo: true,
  }
}

function quakeMarker(h: HazardPoint, onSelect: (h: HazardPoint) => void): Marker {
  return {
    lat: h.lat,
    lng: h.lng,
    color: HAZARD_COLOR,
    radius: 0.12 + (h.magnitude ?? 3) * 0.07,
    label: tooltip(h.title, `${h.source} · ${h.time.slice(0, 16).replace('T', ' ')}Z`),
    onClick: () => onSelect(h),
    flyTo: false,
  }
}

// One marker per affected country; ring layer pulses the same points.
function outbreakMarkers(o: Outbreak, onSelect: (o: Outbreak) => void): Marker[] {
  return o.points.map(p => ({
    lat: p.lat,
    lng: p.lng,
    color: OUTBREAK_COLOR,
    radius: 0.4,
    label: tooltip(o.disease, `${p.country} · WHO · ${o.publishedAt.slice(0, 10)}`),
    onClick: () => onSelect(o),
    flyTo: false,
  }))
}

const HAZARD_GLYPH_STYLE: Record<string, string> = {
  volcano: 'width:11px;height:11px;border:1.5px solid {c}',
  tsunami: 'width:12px;height:12px;border:1.5px solid {c};border-radius:50%',
  alert: 'width:11px;height:11px;border:1.5px solid {c};transform:rotate(45deg)',
}

function makeHazardEl(h: HazardPoint, onClick: (h: HazardPoint) => void): HTMLElement {
  const el = document.createElement('button')
  el.setAttribute('aria-label', `${h.kind}: ${h.title}`)
  el.title = h.title
  el.style.cssText = 'background:transparent;border:0;padding:2px;cursor:pointer;pointer-events:auto'
  const inner = document.createElement('span')
  const color = h.alertLevel === 'red' ? 'var(--down)' : HAZARD_COLOR
  inner.style.cssText =
    'display:block;box-shadow:0 0 0 1px rgba(0,0,0,0.55);' +
    (HAZARD_GLYPH_STYLE[h.kind] ?? HAZARD_GLYPH_STYLE.alert).replaceAll('{c}', color)
  el.appendChild(inner)
  el.onclick = ev => { ev.stopPropagation(); onClick(h) }
  return el
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
  lens, toggles, conflicts, events, hazards, outbreaks, conflictByNeName, selectedCountryName,
  onSelectCountry, onSelectEvent, onSelectHotspot, onSelectHazard, onSelectOutbreak,
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

  const resolveConflict = useCallback(
    (poly: object): ConflictPoint | null =>
      conflictByNeName.get((poly as PolyFeature).properties.name) ?? null,
    [conflictByNeName]
  )

  const handlePolygonClick = useCallback(
    (poly: object | null) => {
      if (!poly) return
      const globe = globeRef.current
      if (globe) globe.controls().autoRotate = false
      onSelectCountry({
        name: (poly as PolyFeature).properties.name,
        conflict: resolveConflict(poly),
      })
    },
    [onSelectCountry, resolveConflict]
  )

  const handleMarkerClick = useCallback((point: object) => {
    const m = point as Marker
    const globe = globeRef.current
    if (globe) {
      globe.controls().autoRotate = false
      if (m.flyTo) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        globe.pointOfView({ lat: m.lat, lng: m.lng, altitude: 1.2 }, reduceMotion ? 0 : 700)
      }
    }
    m.onClick()
  }, [])

  // ── Lens-scoped data layers (never stacked across lenses) ──────────────────
  const isConflictLens = lens === 'conflict'
  const isDisasterLens = lens === 'disasters'
  const isContaminationLens = lens === 'contamination'
  const showEvents = isConflictLens && toggles['events'] !== false
  const showHotspots = isConflictLens && toggles['hotspots'] !== false
  const showOutbreaks = isContaminationLens && toggles['outbreaks'] !== false

  const pointMarkers: Marker[] = useMemo(() => {
    if (showEvents) return events.map(e => eventMarker(e, onSelectEvent))
    if (isDisasterLens && toggles['earthquakes'] !== false) {
      return hazards.filter(h => h.kind === 'earthquake').map(h => quakeMarker(h, onSelectHazard))
    }
    if (showOutbreaks) return outbreaks.flatMap(o => outbreakMarkers(o, onSelectOutbreak))
    return []
  }, [showEvents, isDisasterLens, showOutbreaks, events, hazards, outbreaks, toggles, onSelectEvent, onSelectHazard, onSelectOutbreak])

  // Pulse rings: S4+ events, red-alert hazards, or all outbreak points
  const ringMarkers: Marker[] = useMemo(() => {
    if (showEvents) return events.filter(e => e.severity >= 4).map(e => eventMarker(e, onSelectEvent))
    if (isDisasterLens) {
      return hazards.filter(h => h.alertLevel === 'red').map(h => ({ ...quakeMarker(h, onSelectHazard), color: 'var(--down)' }))
    }
    if (showOutbreaks) return outbreaks.flatMap(o => outbreakMarkers(o, onSelectOutbreak))
    return []
  }, [showEvents, isDisasterLens, showOutbreaks, events, hazards, outbreaks, onSelectEvent, onSelectHazard, onSelectOutbreak])

  const hazardToggleOn = useCallback(
    (h: HazardPoint) =>
      (h.kind === 'volcano' && toggles['volcanoes'] !== false) ||
      (h.kind === 'tsunami' && toggles['tsunami'] !== false) ||
      (h.kind === 'alert' && toggles['alerts'] !== false),
    [toggles]
  )

  // DOM markers: hotspot diamonds (conflict) or non-quake hazard glyphs (disasters)
  const htmlData: object[] = useMemo(() => {
    if (showHotspots) return HOTSPOTS as unknown as object[]
    if (isDisasterLens) return hazards.filter(h => h.kind !== 'earthquake' && hazardToggleOn(h))
    return []
  }, [showHotspots, isDisasterLens, hazards, hazardToggleOn])

  const makeHtmlEl = useCallback(
    (d: object) =>
      isDisasterLens
        ? makeHazardEl(d as HazardPoint, onSelectHazard)
        : makeHotspotEl(d as Hotspot, onSelectHotspot),
    [isDisasterLens, onSelectHazard, onSelectHotspot]
  )

  // NE polygon names with an active outbreak (country spellings resolved)
  const outbreakCountries = useMemo(() => {
    if (!showOutbreaks) return new Set<string>()
    const s = new Set<string>()
    for (const o of outbreaks) for (const c of o.countries) {
      const ne = toNeName(c)
      if (ne) s.add(ne.toLowerCase())
    }
    return s
  }, [showOutbreaks, outbreaks])

  const polygonCapColor = useCallback(
    (poly: object) => {
      const name = (poly as PolyFeature).properties.name
      const isHover = poly === hoverPoly
      const isSelected = selectedCountryName !== null && name === selectedCountryName
      if (isSelected) return 'rgba(200, 162, 74, 0.28)'
      if (isHover) return 'rgba(232, 229, 220, 0.14)'
      if (isContaminationLens) {
        // Choropleth: tint countries named in an active outbreak
        return outbreakCountries.has(name.toLowerCase()) ? 'rgba(176, 122, 176, 0.30)' : 'rgba(0,0,0,0)'
      }
      const conflict = isConflictLens ? resolveConflict(poly) : null
      if (conflict && conflict.threatLevel >= 2) {
        const alpha = 0.10 + conflict.threatLevel * 0.05
        return `${sevColor(conflict.threatLevel)}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
      }
      return 'rgba(0,0,0,0)'
    },
    [hoverPoly, selectedCountryName, isConflictLens, isContaminationLens, outbreakCountries, resolveConflict]
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
      /* Point markers — events (severity channel) or quakes (hazard channel) */
      pointsData={pointMarkers}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d: object) => (d as Marker).color}
      pointRadius={(d: object) => (d as Marker).radius}
      pointAltitude={0.012}
      pointLabel={(d: object) => (d as Marker).label}
      onPointClick={handleMarkerClick}
      /* Pulse rings — S4+ events or red-alert hazards only */
      ringsData={ringMarkers}
      ringLat="lat"
      ringLng="lng"
      ringColor={(d: object) => () => (d as Marker).color}
      ringMaxRadius={3.2}
      ringPropagationSpeed={1.4}
      ringRepeatPeriod={1800}
      ringAltitude={0.013}
      /* DOM markers — hotspot diamonds or non-quake hazard glyphs */
      htmlElementsData={htmlData}
      htmlLat="lat"
      htmlLng="lng"
      htmlAltitude={0.015}
      htmlElement={makeHtmlEl}
    />
  )
}
