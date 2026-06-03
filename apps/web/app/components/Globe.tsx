'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import GlobeGL from 'react-globe.gl'

export interface ConflictPoint {
  id: string
  name: string
  lat: number
  lng: number
  threatLevel: number
}

interface GlobeProps {
  conflicts: ConflictPoint[]
  onSelect: (conflict: ConflictPoint) => void
}

function threatColor(level: number): string {
  if (level >= 5) return '#ef4444'
  if (level >= 4) return '#f97316'
  if (level >= 3) return '#f59e0b'
  if (level >= 2) return '#84cc16'
  return '#22c55e'
}

function makeLabel(c: ConflictPoint): string {
  return `<div style="background:#111827;padding:6px 10px;border-radius:4px;font-size:12px;color:#e5e7eb">
    <strong>${c.name}</strong><br/>Threat: ${c.threatLevel}/5
  </div>`
}

function pointColorFn(d: object) { return threatColor((d as ConflictPoint).threatLevel) }
function pointRadiusFn(d: object) { return 0.4 + (d as ConflictPoint).threatLevel * 0.15 }

export default function Globe({ conflicts, onSelect }: GlobeProps) {
  const globeRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 })

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, 1000)
      globeRef.current.controls().autoRotate = true
      globeRef.current.controls().autoRotateSpeed = 0.3
    }
  }, [])

  const handleClick = useCallback(
    (point: object) => {
      const conflict = point as ConflictPoint
      if (globeRef.current) {
        globeRef.current.controls().autoRotate = false
        globeRef.current.pointOfView(
          { lat: conflict.lat, lng: conflict.lng, altitude: 1.5 },
          800
        )
      }
      onSelect(conflict)
    },
    [onSelect]
  )

  return (
    <GlobeGL
      ref={globeRef}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
      pointsData={conflicts}
      pointLat="lat"
      pointLng="lng"
      pointColor={pointColorFn}
      pointRadius={pointRadiusFn}
      pointAltitude={0.02}
      pointLabel={(d: object) => makeLabel(d as ConflictPoint)}
      onPointClick={handleClick}
      width={dimensions.width}
      height={dimensions.height}
      atmosphereColor="#1e40af"
      atmosphereAltitude={0.15}
    />
  )
}
